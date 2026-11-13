import { SignedXml } from "xml-crypto";
import { base64DePem, pemDeBase64, verificarCadeia } from "./certificado";
import { filho, parsear, primeiro, serializar, texto, todos } from "./xml";

export const ALG = {
  c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  envelopada: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  rsaSha1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  sha1: "http://www.w3.org/2000/09/xmldsig#sha1",
  dsig: "http://www.w3.org/2000/09/xmldsig#",
} as const;

/**
 * Assina o elemento `tag` (que precisa ter atributo Id) com XMLDSig no padrão da NF-e:
 * assinatura envelopada, C14N, RSA-SHA1, digest SHA-1 e o certificado em
 * KeyInfo/X509Data/X509Certificate. O <Signature> fica logo depois do elemento assinado.
 */
export function assinarXml(xml: string, tag: string, chavePem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: chavePem,
    publicCert: certPem,
    signatureAlgorithm: ALG.rsaSha1,
    canonicalizationAlgorithm: ALG.c14n,
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${base64DePem(certPem)}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${tag}']`,
    transforms: [ALG.envelopada, ALG.c14n],
    digestAlgorithm: ALG.sha1,
  });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${tag}']`, action: "after" } });
  return sig.getSignedXml();
}

export interface ResultadoAssinatura {
  ok: boolean;
  /** cStat do MOC quando a verificação falha. */
  cStat?: number;
  motivo?: string;
  certPem?: string;
  cnpj?: string | null;
}

const falha = (cStat: number, motivo: string): ResultadoAssinatura => ({ ok: false, cStat, motivo });

/**
 * Verifica a assinatura do elemento `tag` dentro do XML (por exemplo, infNFe dentro de NFe):
 * padrão dos algoritmos, cadeia do certificado contra a AC informada e o valor da assinatura.
 */
export function verificarAssinatura(xml: string, tag: string, caPem: string): ResultadoAssinatura {
  let doc: Document;
  try {
    doc = parsear(xml);
  } catch {
    return falha(215, "Rejeição: Falha no schema XML");
  }
  const alvos = todos(doc, tag);
  if (alvos.length !== 1) return falha(215, "Rejeição: Falha no schema XML");
  const alvo = alvos[0]!;
  const pai = alvo.parentNode as Element;
  const assinatura = filho(pai, "Signature");
  if (!assinatura || assinatura.namespaceURI !== ALG.dsig) {
    return falha(298, "Rejeição: Assinatura difere do padrão do Sistema");
  }

  // Padrão do sistema: algoritmos, transformações e URI da referência.
  const alg = (nome: string) => primeiro(assinatura, nome)?.getAttribute("Algorithm") ?? "";
  const transformacoes = todos(assinatura, "Transform").map((t) => t.getAttribute("Algorithm"));
  const referencias = todos(assinatura, "Reference");
  const id = alvo.getAttribute("Id") ?? "";
  if (
    alg("CanonicalizationMethod") !== ALG.c14n ||
    alg("SignatureMethod") !== ALG.rsaSha1 ||
    alg("DigestMethod") !== ALG.sha1 ||
    referencias.length !== 1 ||
    referencias[0]!.getAttribute("URI") !== `#${id}` ||
    transformacoes.length !== 2 ||
    transformacoes[0] !== ALG.envelopada ||
    transformacoes[1] !== ALG.c14n
  ) {
    return falha(298, "Rejeição: Assinatura difere do padrão do Sistema");
  }

  const certB64 = texto(assinatura, "X509Certificate");
  if (!certB64) return falha(290, "Rejeição: Certificado Assinatura inválido");
  const certPem = pemDeBase64(certB64);
  const cadeia = verificarCadeia(certPem, caPem);
  if (!cadeia.ok) {
    if (cadeia.motivo === "fora-da-validade") return falha(291, "Rejeição: Certificado Assinatura Data Validade");
    if (cadeia.motivo === "ac-desconhecida") return falha(293, "Rejeição: Certificado Assinatura - erro Cadeia de Certificação");
    return falha(290, "Rejeição: Certificado Assinatura inválido");
  }

  const verificador = new SignedXml({ publicCert: certPem, getCertFromKeyInfo: () => null });
  try {
    verificador.loadSignature(serializar(assinatura));
    if (!verificador.checkSignature(xml)) return falha(297, "Rejeição: Assinatura difere do calculado");
  } catch {
    return falha(297, "Rejeição: Assinatura difere do calculado");
  }
  return { ok: true, certPem, cnpj: cadeia.cnpj };
}

/** Valor do DigestValue da assinatura (vai no protNFe como digVal). */
export function digestDaAssinatura(xml: string): string {
  return texto(parsear(xml), "DigestValue");
}
