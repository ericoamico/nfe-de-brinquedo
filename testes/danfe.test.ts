import { describe, expect, test } from "bun:test";
import { assinarXml } from "../comum/assinatura";
import { carregarPfx } from "../comum/certificado";
import { emitentePadrao } from "../loja/src/config";
import { gerarDanfe } from "../loja/src/danfe";
import { montarNFe, montarNfeProc } from "../loja/src/nfe/montar";
import { gerarCertificadosDeTeste } from "./auxiliar";
import { dadosNotaTeste } from "./fixtures";

/** Extrai o texto do PDF com o pdftotext, se estiver instalado (poppler-utils). */
export function textoDoPdf(pdf: Uint8Array): string | null {
  if (!Bun.which("pdftotext")) return null;
  const r = Bun.spawnSync(["pdftotext", "-layout", "-", "-"], { stdin: pdf });
  return r.exitCode === 0 ? r.stdout.toString() : null;
}

describe("DANFE", async () => {
  const certs = gerarCertificadosDeTeste();
  const a1 = carregarPfx(certs.pfx, certs.senha);
  const n = montarNFe(dadosNotaTeste({ emitente: emitentePadrao() }));
  const assinada = assinarXml(n.xml, "infNFe", a1.chavePem, a1.certPem);
  const prot = `<protNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>T</verAplic><chNFe>${n.chave}</chNFe><dhRecbto>2026-11-13T10:00:00-03:00</dhRecbto><nProt>199260000000042</nProt><digVal>x</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;
  const pdf = await gerarDanfe(montarNfeProc(assinada, prot), { urlConsulta: "https://consulta.exemplo.test/consulta" });
  const bruto = Buffer.from(pdf).toString("latin1");

  test("é um PDF estruturado (tagged), em português, com uma folha", () => {
    expect(bruto.startsWith("%PDF-1.7")).toBe(true);
    expect(bruto).toContain("/StructTreeRoot");
    expect(bruto).toMatch(/\/Marked true/);
    expect(bruto).toContain("/Lang (pt-BR)");
    expect(bruto.match(/\/Type \/Page\b/g)?.length).toBe(1);
  });

  test("traz o aviso de brinquedo, a chave, o protocolo e os itens", () => {
    const texto = textoDoPdf(pdf);
    if (texto === null) return; // sem pdftotext no ambiente: só a checagem estrutural acima
    expect(texto).toContain("DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL");
    expect(texto).toContain("DANFE");
    expect(texto.replace(/\s/g, "")).toContain(n.chave);
    expect(texto).toContain("199260000000042");
    expect(texto).toContain("Caneca de cerâmica Aurora 350 ml");
    expect(texto).toContain("245,60");
    expect(texto).toContain("https://consulta.exemplo.test/consulta");
  });
});
