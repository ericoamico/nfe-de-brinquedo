import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assinarXml, verificarAssinatura } from "../comum/assinatura";
import { carregarPfx } from "../comum/certificado";
import { montarNFe } from "../loja/src/nfe/montar";
import { gerarCertificadosDeTeste, gerarOutraAC } from "./auxiliar";
import { dadosNotaTeste } from "./fixtures";

const certs = gerarCertificadosDeTeste();
const a1 = carregarPfx(certs.pfx, certs.senha);
const ca = readFileSync(certs.raiz, "utf8");
const nota = montarNFe(dadosNotaTeste());
const assinada = assinarXml(nota.xml, "infNFe", a1.chavePem, a1.certPem);

describe("certificado A1 (.pfx)", () => {
  test("abre com a senha certa e extrai o CNPJ do titular", () => {
    expect(a1.cnpj).toBe("99999001000159");
    expect(a1.chavePem).toContain("PRIVATE KEY");
  });
  test("senha errada falha com mensagem clara", () => {
    expect(() => carregarPfx(certs.pfx, "errada")).toThrow(/senha errada/);
  });
});

describe("assinatura XMLDSig do infNFe", () => {
  test("usa C14N, RSA-SHA1, envelopada e X509Certificate no KeyInfo", () => {
    expect(assinada).toContain('<Reference URI="#NFe' + nota.chave + '">');
    expect(assinada).toContain("http://www.w3.org/TR/2001/REC-xml-c14n-20010315");
    expect(assinada).toContain("http://www.w3.org/2000/09/xmldsig#rsa-sha1");
    expect(assinada).toContain("http://www.w3.org/2000/09/xmldsig#enveloped-signature");
    expect(assinada).toMatch(/<\/infNFe><Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    expect(assinada).toMatch(/<KeyInfo><X509Data><X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate>/);
    expect(assinada).not.toMatch(/>\s+</);
  });

  test("assinatura válida é aceita", () => {
    const r = verificarAssinatura(assinada, "infNFe", ca);
    expect(r.ok).toBe(true);
    expect(r.cnpj).toBe("99999001000159");
  });

  test("conteúdo alterado depois de assinar -> 297", () => {
    const r = verificarAssinatura(assinada.replace("<vNF>", "<vNF>1"), "infNFe", ca);
    expect(r).toMatchObject({ ok: false, cStat: 297 });
  });

  test("algoritmo fora do padrão -> 298", () => {
    const r = verificarAssinatura(assinada.replace("xmldsig#rsa-sha1", "xmldsig-more#rsa-sha256"), "infNFe", ca);
    expect(r).toMatchObject({ ok: false, cStat: 298 });
  });

  test("sem assinatura -> 298", () => {
    expect(verificarAssinatura(nota.xml, "infNFe", ca)).toMatchObject({ ok: false, cStat: 298 });
  });

  test("certificado de outra AC -> 293", () => {
    const outra = gerarOutraAC();
    const intruso = carregarPfx(outra.pfx, outra.senha);
    const xml = assinarXml(nota.xml, "infNFe", intruso.chavePem, intruso.certPem);
    expect(verificarAssinatura(xml, "infNFe", ca)).toMatchObject({ ok: false, cStat: 293 });
    // e a própria AC dele aceita: prova que o problema é só a cadeia
    expect(verificarAssinatura(xml, "infNFe", readFileSync(outra.raiz, "utf8")).ok).toBe(true);
  });
});
