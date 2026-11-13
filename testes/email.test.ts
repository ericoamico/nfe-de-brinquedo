import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assinarXml } from "../comum/assinatura";
import { carregarPfx } from "../comum/certificado";
import { emitentePadrao } from "../loja/src/config";
import {
  AdaptadorArquivo, AdaptadorSmtp, ASSUNTO_NOTA, adaptadorDoAmbiente, criarServicoEmail, montarEmailNota,
} from "../loja/src/email";
import { montarNFe, montarNfeProc } from "../loja/src/nfe/montar";
import { gerarCertificadosDeTeste } from "./auxiliar";
import { dadosNotaTeste } from "./fixtures";

const certs = gerarCertificadosDeTeste();
const a1 = carregarPfx(certs.pfx, certs.senha);
const n = montarNFe(dadosNotaTeste({ emitente: emitentePadrao(), numero: 7 }));
const xml = montarNfeProc(
  assinarXml(n.xml, "infNFe", a1.chavePem, a1.certPem),
  `<protNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infProt><cStat>100</cStat></infProt></protNFe>`,
);
const pdf = new TextEncoder().encode("%PDF-1.7 de mentira");
const dest = { nome: "Maria da Silva", email: "maria@example.com" };

describe("modelo do e-mail da nota", () => {
  const m = montarEmailNota(dest, pdf, xml, { pedido: "100007", urlPedido: "https://loja.test/pedido/100007" });
  test("assunto, anexos e textos de loja de verdade", () => {
    expect(m.assunto).toBe("Sua nota fiscal - Loja do Érico (fictícia)");
    expect(m.anexos.map((a) => [a.nome, a.tipo])).toEqual([
      ["nota-fiscal-7.pdf", "application/pdf"],
      ["nota-fiscal-7.xml", "application/xml"],
    ]);
    expect(m.texto).toContain("Olá, Maria!");
    expect(m.texto.replace(/\u00a0/g, " ")).toContain("Valor total: R$ 245,60");
    expect(m.texto).toContain("sem valor fiscal");
  });
  test("HTML simples e acessível, com rodapé de brinquedo", () => {
    expect(m.html).toContain('<html lang="pt-BR">');
    expect(m.html).toContain(`<title>${ASSUNTO_NOTA}</title>`);
    expect(m.html).toMatch(/<h1[^>]*>Olá, Maria! Sua nota fiscal chegou.<\/h1>/);
    expect(m.html).toContain('<th scope="row"');
    expect(m.html).toContain("documentos de brinquedo, sem valor fiscal");
    expect(m.html).not.toMatch(/cStat|xMotivo|SOAP|<script/);
  });
});

describe("adaptador arquivo", () => {
  test("salva HTML, texto, .eml e anexos numa pasta", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "emails-"));
    const servico = criarServicoEmail(new AdaptadorArquivo(pasta), '"Loja" <loja@exemplo.test>');
    const r = await servico.enviarNota(dest, pdf, xml, { pedido: "100007" });
    expect(readdirSync(pasta)).toHaveLength(1);
    for (const f of ["mensagem.html", "mensagem.txt", "mensagem.eml", "cabecalhos.json", "anexos/nota-fiscal-7.pdf", "anexos/nota-fiscal-7.xml"]) {
      expect(existsSync(join(r.id, f))).toBe(true);
    }
    expect(readFileSync(join(r.id, "anexos/nota-fiscal-7.xml"), "utf8")).toBe(xml);
    const cab = JSON.parse(readFileSync(join(r.id, "cabecalhos.json"), "utf8"));
    expect(cab.assunto).toBe(ASSUNTO_NOTA);
    expect(cab.para.email).toBe("maria@example.com");
    const eml = readFileSync(join(r.id, "mensagem.eml"), "utf8");
    expect(eml).toContain("multipart/mixed");
    expect(eml).toContain('filename=nota-fiscal-7.pdf');
  });
});

describe("escolha do adaptador por variável de ambiente", () => {
  test("arquivo é o padrão; smtp exige host; nome desconhecido falha", () => {
    expect(adaptadorDoAmbiente({}).nome).toBe("arquivo");
    expect(() => adaptadorDoAmbiente({ EMAIL_ADAPTADOR: "smtp" })).toThrow(/SMTP_HOST/);
    expect(adaptadorDoAmbiente({ EMAIL_ADAPTADOR: "smtp", SMTP_HOST: "smtp.exemplo.test" }).nome).toBe("smtp");
    expect(() => adaptadorDoAmbiente({ EMAIL_ADAPTADOR: "gmail" })).toThrow(/desconhecido/);
  });
});

describe("adaptador SMTP", () => {
  // Servidor SMTP mínimo, só para o teste: aceita a mensagem e guarda o DATA.
  const recebidas: { de: string; para: string[]; dados: string }[] = [];
  let atual = { de: "", para: [] as string[], dados: "" };
  let lendoDados = false;
  const servidor = Bun.listen<{ buf: string }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) { s.data = { buf: "" }; s.write("220 teste ESMTP\r\n"); },
      data(s, chunk) {
        s.data.buf += chunk.toString();
        let i: number;
        while ((i = s.data.buf.indexOf("\r\n")) >= 0 || (lendoDados && s.data.buf.includes("\r\n.\r\n"))) {
          if (lendoDados) {
            const fim = s.data.buf.indexOf("\r\n.\r\n");
            if (fim < 0) return;
            atual.dados = s.data.buf.slice(0, fim);
            s.data.buf = s.data.buf.slice(fim + 5);
            lendoDados = false;
            recebidas.push(atual);
            atual = { de: "", para: [], dados: "" };
            s.write("250 OK guardado\r\n");
            continue;
          }
          const linha = s.data.buf.slice(0, i);
          s.data.buf = s.data.buf.slice(i + 2);
          const cmd = linha.toUpperCase();
          if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) s.write("250-teste\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (cmd.startsWith("AUTH")) s.write("235 OK\r\n");
          else if (cmd.startsWith("MAIL FROM")) { atual.de = linha; s.write("250 OK\r\n"); }
          else if (cmd.startsWith("RCPT TO")) { atual.para.push(linha); s.write("250 OK\r\n"); }
          else if (cmd === "DATA") { lendoDados = true; s.write("354 manda\r\n"); }
          else if (cmd === "QUIT") { s.write("221 tchau\r\n"); s.end(); }
          else s.write("250 OK\r\n");
        }
      },
    },
  });
  afterAll(() => servidor.stop(true));

  test("entrega a nota para o servidor SMTP configurado", async () => {
    const smtp = new AdaptadorSmtp({ host: "127.0.0.1", porta: servidor.port, seguro: false, exigirTls: false, usuario: "u", senha: "s" });
    const r = await criarServicoEmail(smtp, '"Loja do Érico (fictícia)" <loja@exemplo.test>').enviarNota(dest, pdf, xml);
    expect(r.id).toMatch(/@/);
    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]!.para[0]).toContain("maria@example.com");
    expect(recebidas[0]!.dados).toContain("nota-fiscal-7.xml");
    expect(recebidas[0]!.dados).toMatch(/Subject: =\?UTF-8\?/);
  });
});
