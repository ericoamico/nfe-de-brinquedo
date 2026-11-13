import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assinarXml, verificarAssinatura } from "../comum/assinatura";
import { carregarPfx } from "../comum/certificado";
import { contentTypeSoap, envelopeRequisicao, SERVICOS } from "../comum/soap";
import { primeiro, serializar, texto } from "../comum/xml";
import { type AutorizadoraEmExecucao, iniciarAutorizadora } from "../autorizadora/src/index";
import { ClienteAutorizadora, ErroComunicacao } from "../loja/src/nfe/cliente";
import { type DadosNota, montarEnviNFe, montarNFe } from "../loja/src/nfe/montar";
import { configAutorizadoraTeste, gerarCertificadoIntruso, gerarCertificadosDeTeste, gerarOutraAC } from "./auxiliar";
import { dadosNotaTeste, EMITENTE_TESTE } from "./fixtures";

process.env.LOG_SILENCIOSO = "1";
const certs = gerarCertificadosDeTeste();
const a1 = carregarPfx(certs.pfx, certs.senha);
const ca = readFileSync(certs.raiz, "utf8");

let aut: AutorizadoraEmExecucao;
let cliente: ClienteAutorizadora;
let lote = 0;

beforeAll(() => {
  aut = iniciarAutorizadora(configAutorizadoraTeste(certs));
  cliente = new ClienteAutorizadora({
    urlBase: aut.urlWs, certPem: a1.certPem, chavePem: a1.chavePem, caPem: ca, timeoutMs: 3000, tpAmb: 2,
  });
});
afterAll(() => aut.parar());

function notaAssinada(extra: Partial<DadosNota> = {}, mutar: (xml: string) => string = (x) => x, chave = a1) {
  const n = montarNFe(dadosNotaTeste(extra));
  return { chave: n.chave, xml: assinarXml(mutar(n.xml), "infNFe", chave.chavePem, chave.certPem) };
}

async function enviar(xmlAssinado: string) {
  const ret = await cliente.autorizar(montarEnviNFe(xmlAssinado, String(++lote).padStart(15, "0")));
  const prot = primeiro(ret, "protNFe");
  return { lote: Number(texto(ret, "cStat")), prot: Number(texto(prot, "cStat")), motivo: texto(prot, "xMotivo"), ret };
}

describe("TLS mútuo", () => {
  test("recusa conexão sem certificado cliente", async () => {
    const r = fetch(aut.urlWs + SERVICOS.autorizacao.caminho, { method: "POST", body: "x", tls: { ca } } as RequestInit);
    await expect(r).rejects.toThrow();
  });
  test("recusa certificado cliente de fora da AC de brinquedo", async () => {
    const i = gerarCertificadoIntruso();
    const r = fetch(aut.urlWs + SERVICOS.autorizacao.caminho, {
      method: "POST", body: "x", tls: { ca, cert: readFileSync(i.cert, "utf8"), key: readFileSync(i.key, "utf8") },
    } as RequestInit);
    await expect(r).rejects.toThrow();
  });
  test("envelope SOAP inválido recebe Fault com HTTP 400", async () => {
    const r = await fetch(aut.urlWs + SERVICOS.autorizacao.caminho, {
      method: "POST", headers: { "content-type": contentTypeSoap("autorizacao") }, body: "<nada/>",
      tls: { ca, cert: a1.certPem, key: a1.chavePem },
    } as RequestInit);
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("Fault");
  });
});

describe("NFeAutorizacao4 síncrono", () => {
  let chaveAutorizada = "";

  test("nota válida: lote 104 + protNFe 100 com nProt e assinatura da autorizadora", async () => {
    const n = notaAssinada({ numero: 1 });
    const r = await enviar(n.xml);
    expect(r.lote).toBe(104);
    expect(r.prot).toBe(100);
    const nProt = texto(r.ret, "nProt");
    expect(nProt).toMatch(/^\d{15}$/);
    expect(texto(r.ret, "chNFe")).toBe(n.chave);
    // a autorizadora assina o infProt
    const prot = serializar(primeiro(r.ret, "protNFe")!);
    expect(verificarAssinatura(prot, "infProt", ca).ok).toBe(true);
    chaveAutorizada = n.chave;
  });

  test("reenvio da mesma nota -> 204 duplicidade", async () => {
    const n = notaAssinada({ numero: 1 });
    expect(n.chave).toBe(chaveAutorizada);
    const r = await enviar(n.xml);
    expect(r.prot).toBe(204);
    expect(r.motivo).toContain("Duplicidade de NF-e [nRec:");
  });

  test("mesmo número com outra chave -> 539", async () => {
    const r = await enviar(notaAssinada({ numero: 1, cNF: "87654321" }).xml);
    expect(r.prot).toBe(539);
    expect(r.motivo).toContain(`[chNFe:${chaveAutorizada}]`);
  });

  test("numeração pulando números -> 999 (fora de sequência)", async () => {
    const r = await enviar(notaAssinada({ numero: 5 }).xml);
    expect(r.prot).toBe(999);
    expect(r.motivo).toContain("fora de sequência");
  });

  test("DV da chave errado -> 253", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }, (x) => x.replace(/Id="NFe(\d{43})(\d)"/, (_, b, d) => `Id="NFe${b}${(Number(d) + 1) % 10}"`)).xml);
    expect(r.prot).toBe(253);
  });

  test("Id não bate com os campos da nota -> 502", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }, (x) => x.replace("<cNF>12345678</cNF>", "<cNF>12345679</cNF>")).xml);
    expect(r.prot).toBe(502);
  });

  test("assinatura que não confere -> 297", async () => {
    const n = notaAssinada({ numero: 2 });
    const r = await enviar(n.xml.replace("<xNome>Maria da Silva</xNome>", "<xNome>Maria da Selva</xNome>"));
    expect(r.prot).toBe(297);
  });

  test("assinada com certificado de outra AC -> 293", async () => {
    const outra = gerarOutraAC();
    const r = await enviar(notaAssinada({ numero: 2 }, undefined, carregarPfx(outra.pfx, outra.senha)).xml);
    expect(r.prot).toBe(293);
  });

  test("CNPJ do emitente diferente do certificado -> 213", async () => {
    const emitente = { ...EMITENTE_TESTE, cnpj: "11222333000181" };
    const r = await enviar(notaAssinada({ numero: 1, emitente }).xml);
    expect(r.prot).toBe(213);
  });

  test("CPF do destinatário inválido -> 237", async () => {
    const base = dadosNotaTeste();
    const r = await enviar(notaAssinada({ numero: 2, destinatario: { ...base.destinatario, cpf: "52998224724" } }).xml);
    expect(r.prot).toBe(237);
  });

  test("valor do item diferente de quantidade x unitário -> 629", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }, (x) => x.replace("<vProd>99.80</vProd>", "<vProd>99.70</vProd>")).xml);
    expect(r.prot).toBe(629);
  });

  test("soma dos itens diferente do total de produtos -> 564", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }, (x) => x.replace(/<ICMSTot>(.*?)<vProd>229.70<\/vProd>/, "<ICMSTot>$1<vProd>229.71</vProd>")).xml);
    expect(r.prot).toBe(564);
  });

  test("total da nota que não fecha -> 610", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }, (x) => x.replace("<vNF>245.60</vNF>", "<vNF>245.61</vNF>")).xml);
    expect(r.prot).toBe(610);
  });

  test("ambiente errado -> 252", async () => {
    const r = await enviar(notaAssinada({ numero: 2, tpAmb: 1 }).xml);
    expect(r.prot).toBe(252);
  });

  test("a próxima nota da sequência é autorizada", async () => {
    const r = await enviar(notaAssinada({ numero: 2 }).xml);
    expect(r.prot).toBe(100);
  });
});

describe("NFeConsultaProtocolo4", () => {
  test("chave autorizada -> 100 com o protNFe", async () => {
    const n = notaAssinada({ numero: 1 });
    const ret = await cliente.consultarChave(n.chave);
    expect(texto(ret, "cStat")).toBe("100");
    expect(texto(ret, "nProt")).toMatch(/^\d{15}$/);
  });
  test("chave desconhecida -> 217", async () => {
    const n = notaAssinada({ numero: 99 });
    expect(texto(await cliente.consultarChave(n.chave), "cStat")).toBe("217");
  });
  test("chave com DV errado -> 236", async () => {
    const n = notaAssinada({ numero: 99 });
    const errada = n.chave.slice(0, 43) + ((Number(n.chave[43]) + 1) % 10);
    expect(texto(await cliente.consultarChave(errada), "cStat")).toBe("236");
  });
});

describe("página pública de consulta", () => {
  test("mostra a nota autorizada, sem detalhes técnicos", async () => {
    const n = notaAssinada({ numero: 1 });
    const html = await (await fetch(`${aut.urlPublica}/consulta?chave=${n.chave}`)).text();
    expect(html).toContain("<title>Nota fiscal autorizada - Receita de Brinquedo</title>");
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain("<main");
    expect(html).toContain("***.982.247-**");
    expect(html).not.toMatch(/cStat|xMotivo|SOAP|XML/);
  });
  test("chave com tamanho errado mostra erro ligado ao campo", async () => {
    const html = await (await fetch(`${aut.urlPublica}/consulta?chave=123`)).text();
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="chave-ajuda chave-erro"');
    expect(html).toMatch(/<title>Erro:/);
  });
});

describe("modo caos", () => {
  test("103: lote assíncrono, recibo 105 e depois 104 com a nota autorizada", async () => {
    aut.ctx.config.caos.forcar = "103";
    const r = await enviar(notaAssinada({ numero: 3 }).xml);
    aut.ctx.config.caos.forcar = undefined;
    expect(r.lote).toBe(103);
    const nRec = texto(r.ret, "nRec");
    expect(texto(await cliente.consultarRecibo(nRec), "cStat")).toBe("105");
    await Bun.sleep(250);
    const ret = await cliente.consultarRecibo(nRec);
    expect(texto(ret, "cStat")).toBe("104");
    expect(texto(ret.getElementsByTagNameNS("*", "protNFe")[0], "cStat")).toBe("100");
    expect(texto(await cliente.consultarRecibo("991999999999999"), "cStat")).toBe("106");
  });

  test("conexão derrubada depois de processar: a consulta pela chave acha a nota", async () => {
    aut.ctx.config.caos.forcar = "derrubar-depois";
    const n = notaAssinada({ numero: 4 });
    const erro = await enviar(n.xml).catch((e) => e);
    aut.ctx.config.caos.forcar = undefined;
    expect(erro).toBeInstanceOf(ErroComunicacao);
    expect(texto(await cliente.consultarChave(n.chave), "cStat")).toBe("100");
  });

  test("atraso maior que o timeout do cliente", async () => {
    aut.ctx.config.caos.forcar = "atraso";
    aut.ctx.config.caos.atrasoMaxMs = 1200;
    const rapido = new ClienteAutorizadora({
      urlBase: aut.urlWs, certPem: a1.certPem, chavePem: a1.chavePem, caPem: ca, timeoutMs: 150, tpAmb: 2,
    });
    const erro = await rapido.autorizar(montarEnviNFe(notaAssinada({ numero: 5 }).xml, "000000000000777")).catch((e) => e);
    aut.ctx.config.caos.forcar = undefined;
    expect(erro).toBeInstanceOf(ErroComunicacao);
    expect((erro as ErroComunicacao).tipo).toBe("timeout");
  });
});

describe("modo proxy (o proxy faz o TLS mútuo e repassa o certificado)", () => {
  let p: AutorizadoraEmExecucao;
  beforeAll(() => { p = iniciarAutorizadora(configAutorizadoraTeste(certs, { mtlsModo: "proxy", proxySegredo: "s3gr3do" })); });
  afterAll(() => p.parar());

  const chamar = (headers: Record<string, string>) =>
    fetch(p.urlWs + SERVICOS.consultaProtocolo.caminho, {
      method: "POST",
      headers: { "content-type": contentTypeSoap("consultaProtocolo"), ...headers },
      body: envelopeRequisicao("consultaProtocolo", `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><xServ>CONSULTAR</xServ><chNFe>${"9".repeat(44)}</chNFe></consSitNFe>`),
    });

  test("aceita certificado da AC repassado pelo proxy", async () => {
    const r = await chamar({ "x-proxy-segredo": "s3gr3do", "x-ssl-client-verify": "SUCCESS", "x-ssl-client-cert": encodeURIComponent(a1.certPem) });
    expect(r.status).toBe(200);
  });
  test("aceita o formato do Caddy (DER em base64, sem cabeçalhos PEM)", async () => {
    const der = a1.certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    const r = await chamar({ "x-proxy-segredo": "s3gr3do", "x-ssl-client-verify": "SUCCESS", "x-ssl-client-cert": der });
    expect(r.status).toBe(200);
  });
  test("recusa sem cabeçalhos, com segredo errado ou com certificado de fora", async () => {
    expect((await chamar({})).status).toBe(403);
    expect((await chamar({ "x-proxy-segredo": "x", "x-ssl-client-verify": "SUCCESS", "x-ssl-client-cert": encodeURIComponent(a1.certPem) })).status).toBe(403);
    const outra = carregarPfx(gerarOutraAC().pfx, certs.senha);
    expect((await chamar({ "x-proxy-segredo": "s3gr3do", "x-ssl-client-verify": "SUCCESS", "x-ssl-client-cert": encodeURIComponent(outra.certPem) })).status).toBe(403);
  });
});
