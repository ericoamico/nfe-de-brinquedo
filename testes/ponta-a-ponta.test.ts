import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verificarAssinatura } from "../comum/assinatura";
import { chaveValida } from "../comum/chave";
import { parsear, primeiro, serializar, texto } from "../comum/xml";
import { type AutorizadoraEmExecucao, iniciarAutorizadora } from "../autorizadora/src/index";
import { AdaptadorArquivo, criarServicoEmail } from "../loja/src/email";
import { iniciarLoja, type LojaEmExecucao } from "../loja/src/index";
import {
  CLIENTE_TESTE, configAutorizadoraTeste, configLojaTeste, gerarCertificadosDeTeste, Navegador, textoDoPdf,
} from "./auxiliar";

process.env.LOG_SILENCIOSO = "1";
const certs = gerarCertificadosDeTeste();
const ca = readFileSync(certs.raiz, "utf8");

let aut: AutorizadoraEmExecucao;
let loja: LojaEmExecucao;
let pastaEmails: string;

beforeAll(() => {
  aut = iniciarAutorizadora(configAutorizadoraTeste(certs, { loteAssincronoMs: 150 }));
  pastaEmails = mkdtempSync(join(tmpdir(), "emails-e2e-"));
  loja = iniciarLoja(configLojaTeste(certs, aut.urlWs, { urlConsulta: `${aut.urlPublica}/consulta` }), {
    fila: false,
    email: criarServicoEmail(new AdaptadorArquivo(pastaEmails)),
  });
});
afterAll(async () => {
  await loja.parar();
  aut.parar();
});
beforeEach(() => {
  aut.ctx.config.caos.forcar = undefined;
  aut.ctx.config.tpAmb = 2;
});

const semTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const PROIBIDO_NA_TELA = /cStat|xMotivo|SOAP|XMLDSig|assinatura|autorizadora|caos|protNFe|\b\d{44}\b|stack|JSON/i;

async function comprar(produtos: [string, number][], cliente = CLIENTE_TESTE) {
  const nav = new Navegador(loja.url);
  for (const [produto, quantidade] of produtos) {
    const r = await nav.ir("/carrinho/adicionar", { produto, quantidade: String(quantidade) });
    expect(r.status).toBe(303);
  }
  const r = await nav.ir("/finalizar", cliente);
  expect(r.status).toBe(303);
  const local = r.headers.get("location")!;
  const codigo = /\/pedido\/(\d+)/.exec(local)![1]!;
  const pagina = await nav.seguir(r);
  const html = await pagina.text();
  const pedido = loja.banco.pedidoPorCodigo(codigo)!;
  return { nav, html, codigo, pedido, nota: () => loja.banco.nota(pedido.id)! };
}

function emailsPara(codigo: string) {
  return readdirSync(pastaEmails)
    .map((d) => join(pastaEmails, d))
    .filter((d) => readFileSync(join(d, "mensagem.txt"), "utf8").includes(`pedido ${codigo}`));
}

describe("ponta a ponta: pedido -> autorização -> DANFE -> e-mail", () => {
  test("compra feliz", async () => {
    const { html, codigo, nota, nav } = await comprar([["caneca-aurora", 2], ["fone-pulso", 1]]);

    // Tela de confirmação: mensagem de loja, nada técnico.
    expect(html).toContain(`<title>Pedido ${codigo} confirmado | Loja do Érico (fictícia)</title>`);
    expect(html).toContain("Pedido confirmado!");
    expect(html).toContain("A nota fiscal foi enviada para o seu e-mail.");
    expect(semTags(html)).not.toMatch(PROIBIDO_NA_TELA);

    // Nota autorizada e guardada com o nfeProc.
    const n = nota();
    expect(n.situacao).toBe("autorizada");
    expect(chaveValida(n.chave)).toBe(true);
    expect(n.chave.startsWith("99")).toBe(true);
    expect(n.xml_proc).not.toMatch(/>\s+</);
    const proc = parsear(n.xml_proc!);
    expect(proc.documentElement.localName).toBe("nfeProc");
    expect(texto(primeiro(proc, "protNFe"), "cStat")).toBe("100");
    expect(texto(proc, "indPres")).toBe("2");
    expect(texto(proc, "indIntermed")).toBe("0");
    expect(texto(primeiro(proc, "dest"), "CPF")).toBe("52998224725");
    // A assinatura continua válida dentro do nfeProc.
    expect(verificarAssinatura(serializar(primeiro(proc, "NFe")!), "infNFe", ca).ok).toBe(true);
    // Valor: 2 x 49,90 + 349,90 = 449,70, frete grátis acima de 299.
    expect(texto(proc, "vNF")).toBe("449.70");

    // E-mail salvo pelo adaptador "arquivo", com PDF e XML.
    const [pasta, ...outros] = emailsPara(codigo);
    expect(outros).toHaveLength(0);
    const cab = JSON.parse(readFileSync(join(pasta!, "cabecalhos.json"), "utf8"));
    expect(cab.assunto).toBe("Sua nota fiscal - Loja do Érico (fictícia)");
    expect(cab.para.email).toBe("maria@example.com");
    const pdf = readFileSync(join(pasta!, `anexos/nota-fiscal-${n.numero}.pdf`));
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.7");
    const textoPdf = textoDoPdf(pdf);
    if (textoPdf) {
      expect(textoPdf).toContain("DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL");
      expect(textoPdf).toContain(n.nprot!);
    }
    expect(readFileSync(join(pasta!, `anexos/nota-fiscal-${n.numero}.xml`), "utf8")).toBe(n.xml_proc!);
    expect(existsSync(join(pasta!, "mensagem.html"))).toBe(true);

    // Página pública de consulta (o QR Code aponta para ela).
    const consulta = await (await fetch(`${aut.urlPublica}/consulta?chave=${n.chave}`)).text();
    expect(consulta).toContain("Nota fiscal autorizada");
    expect(consulta).toContain(n.nprot!);

    // Meus pedidos e downloads.
    const lista = await (await nav.ir("/pedidos")).text();
    expect(lista).toContain(`Pedido ${codigo}`);
    expect(lista).toContain("Nota fiscal enviada por e-mail");
    const baixado = await nav.ir(`/pedido/${codigo}/nota-fiscal.pdf`);
    expect(baixado.headers.get("content-type")).toBe("application/pdf");
    const xmlBaixado = await nav.ir(`/pedido/${codigo}/nota-fiscal.xml`);
    expect(await xmlBaixado.text()).toBe(n.xml_proc!);

    // Outro navegador não vê o pedido; com número + e-mail, passa a ver.
    const estranho = new Navegador(loja.url);
    expect((await estranho.ir(`/pedido/${codigo}`)).status).toBe(404);
    expect((await estranho.ir("/pedidos/buscar", { codigo, email: "outro@example.com" })).status).toBe(404);
    expect((await estranho.ir("/pedidos/buscar", { codigo, email: "MARIA@example.com" })).status).toBe(303);
    expect((await estranho.ir(`/pedido/${codigo}`)).status).toBe(200);
  });

  test("conexão cai depois da autorização: a loja consulta pela chave e não reenvia", async () => {
    aut.ctx.config.caos.forcar = "derrubar-depois";
    const { html, nota } = await comprar([["livro-cafe-coado", 1]]);
    const n = nota();
    expect(n.situacao).toBe("autorizada");
    expect(n.tentativas).toBe(1);
    expect(html).toContain("A nota fiscal foi enviada para o seu e-mail.");
  });

  test("autorizadora responde 103: a loja consulta o recibo até sair o resultado", async () => {
    aut.ctx.config.caos.forcar = "103";
    const { nota, html } = await comprar([["camiseta-basica", 1]]);
    expect(nota().situacao).toBe("autorizada");
    expect(html).toContain("A nota fiscal foi enviada para o seu e-mail.");
  });

  test("conexão cai antes de processar: fila de reprocessamento, mesmo número na nova tentativa", async () => {
    aut.ctx.config.caos.forcar = "derrubar-antes";
    const { html, nota, pedido, codigo, nav } = await comprar([["mochila-trilha", 1]]);
    const antes = nota();
    expect(antes.situacao).toBe("reprocessar");
    expect(antes.proxima_tentativa).toBeGreaterThan(Date.now());
    expect(html).toContain("Não conseguimos emitir a nota agora, já estamos tentando de novo.");
    expect(semTags(html)).not.toMatch(PROIBIDO_NA_TELA);
    expect(aut.ctx.banco.notaPorChave(antes.chave)).toBeNull();

    // A autorizadora volta ao normal e a fila tenta de novo.
    aut.ctx.config.caos.forcar = undefined;
    expect(await loja.emissor.emitir(pedido.id)).toBe("autorizada");
    const depois = nota();
    expect(depois.numero).toBe(antes.numero);
    expect(depois.chave).toBe(antes.chave);
    expect(depois.xml_assinado).toBe(antes.xml_assinado);
    expect(emailsPara(codigo)).toHaveLength(1);
    const pagina = await (await nav.ir(`/pedido/${codigo}`)).text();
    expect(pagina).toContain("Nota fiscal enviada por e-mail");
  });

  test("timeout: consulta pela chave antes de reenviar e não duplica", async () => {
    aut.ctx.config.caos.forcar = "atraso";
    aut.ctx.config.caos.atrasoMaxMs = 2500; // atraso entre 625 e 2500 ms
    const { nota, pedido } = await comprar([["luminaria-farol", 1]]);
    // Com timeout de 1500 ms o envio pode ou não estourar; nos dois casos a nota termina certa.
    aut.ctx.config.caos.forcar = undefined;
    await loja.emissor.aguardar();
    if (nota().situacao !== "autorizada") expect(await loja.emissor.emitir(pedido.id)).toBe("autorizada");
    const n = nota();
    expect(n.situacao).toBe("autorizada");
    expect(aut.ctx.banco.notaPorChave(n.chave)?.numero).toBe(n.numero);
  });

  test("rejeição: mensagem amigável na tela, detalhe só no log", async () => {
    aut.ctx.config.tpAmb = 1; // a autorizadora passa a rejeitar com 252
    const { html, nota } = await comprar([["garrafa-serra", 1]]);
    const n = nota();
    expect(n.situacao).toBe("rejeitada");
    expect(n.ultimo_cstat).toBe(252);
    expect(html).toContain("Pedido confirmado!");
    expect(html).toContain("Tivemos um problema ao emitir a sua nota fiscal");
    expect(semTags(html)).not.toMatch(PROIBIDO_NA_TELA);
  });

  test("os números das notas seguem em sequência, sem buracos", () => {
    const numeros = loja.banco.db.query("SELECT numero FROM notas ORDER BY numero").all().map((r: any) => r.numero);
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });
});

describe("checkout com dados inválidos", () => {
  test("mostra o resumo de erros acessível e não cria pedido", async () => {
    const nav = new Navegador(loja.url);
    await nav.ir("/carrinho/adicionar", { produto: "caneca-aurora", quantidade: "1" });
    const antes = loja.banco.db.query("SELECT COUNT(*) AS n FROM pedidos").get() as { n: number };
    const r = await nav.ir("/finalizar", { ...CLIENTE_TESTE, cpf: "123.456.789-00", email: "sem-arroba" });
    expect(r.status).toBe(422);
    const html = await r.text();
    expect(html).toContain("<title>Erro: falta corrigir 2 campos. Finalizar compra | Loja do Érico (fictícia)</title>");
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="#cpf"');
    expect(html).toMatch(/<input id="cpf"[^>]*aria-invalid="true"[^>]*aria-describedby="cpf-dica cpf-erro"/);
    expect(html).toContain('value="Maria da Silva"'); // o que estava certo continua preenchido
    const depois = loja.banco.db.query("SELECT COUNT(*) AS n FROM pedidos").get() as { n: number };
    expect(depois.n).toBe(antes.n);
  });
});

describe("estrutura acessível das páginas", () => {
  const paginas = ["/", "/produto/fone-pulso", "/carrinho", "/pedidos", "/rota-que-nao-existe"];
  for (const p of paginas) {
    test(`${p}: idioma, título, pular link, landmarks e um h1`, async () => {
      const html = await (await new Navegador(loja.url).ir(p)).text();
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain('<html lang="pt-BR">');
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).toContain('<a class="pular" href="#conteudo">');
      expect(html).toContain('<nav aria-label="Principal">');
      expect(html).toContain('<main id="conteudo"');
      expect(html).toContain("<footer");
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      // todo input visível tem label
      for (const m of html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        if (/type="hidden"/.test(m[0])) continue;
        expect(html).toContain(`for="${m[1]}"`);
      }
      expect(semTags(html)).not.toMatch(PROIBIDO_NA_TELA);
    });
  }
});
