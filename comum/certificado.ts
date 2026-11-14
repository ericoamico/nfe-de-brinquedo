import forge from "node-forge";
import { readFileSync } from "node:fs";

export interface CertificadoA1 {
  chavePem: string;
  certPem: string;
  /** Certificados da cadeia que vieram dentro do .pfx (ex.: a AC raiz). */
  cadeiaPem: string[];
  titular: string;
  cnpj: string | null;
  validoAte: Date;
}

const ehAC = (c: forge.pki.Certificate) =>
  c.extensions.some((e: any) => e.name === "basicConstraints" && e.cA);

/**
 * Abre um .pfx (PKCS#12) protegido por senha, como um e-CNPJ A1.
 * Aceita caminho de arquivo ou o conteúdo binário.
 */
export function carregarPfx(origem: string | Uint8Array, senha: string): CertificadoA1 {
  const bytes = typeof origem === "string" ? readFileSync(origem) : Buffer.from(origem);
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(Buffer.from(bytes).toString("binary")), senha);
  } catch (e) {
    throw new Error("não foi possível abrir o certificado .pfx (senha errada ou arquivo inválido)");
  }
  const oidChave = forge.pki.oids.pkcs8ShroudedKeyBag!;
  const oidCert = forge.pki.oids.certBag!;
  const chaves = [
    ...(p12.getBags({ bagType: oidChave })[oidChave] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag! })[forge.pki.oids.keyBag!] ?? []),
  ];
  const certs = (p12.getBags({ bagType: oidCert })[oidCert] ?? []).map((b) => b.cert!).filter(Boolean);
  const chave = chaves[0]?.key;
  const titular = certs.find((c) => !ehAC(c));
  if (!chave || !titular) throw new Error("o .pfx não contém chave privada e certificado do titular");
  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(titular),
    cadeiaPem: certs.filter((c) => c !== titular).map((c) => forge.pki.certificateToPem(c)),
    titular: nomeComum(titular),
    cnpj: cnpjDoCertificado(titular),
    validoAte: titular.validity.notAfter,
  };
}

function nomeComum(c: forge.pki.Certificate): string {
  return String(c.subject.getField("CN")?.value ?? "");
}

/** No padrão ICP-Brasil o CN do e-CNPJ termina com ":<CNPJ>". */
export function cnpjDoCertificado(cert: forge.pki.Certificate | string): string | null {
  const c = typeof cert === "string" ? forge.pki.certificateFromPem(cert) : cert;
  const m = /:(\d{14})$/.exec(nomeComum(c));
  return m ? m[1]! : null;
}

/** Converte o conteúdo de <X509Certificate> (DER em base64) para PEM. */
export function pemDeBase64(b64: string): string {
  const limpo = b64.replace(/\s+/g, "");
  const linhas = limpo.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${linhas.join("\n")}\n-----END CERTIFICATE-----\n`;
}

/** Base64 do DER, sem cabeçalhos nem quebras (para o <X509Certificate>). */
export function base64DePem(pem: string): string {
  return pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
}

export interface ResultadoCadeia {
  ok: boolean;
  motivo?: "fora-da-validade" | "ac-desconhecida" | "certificado-invalido";
  cnpj?: string | null;
}

/** Verifica se o certificado foi emitido pela AC informada e está dentro da validade. */
export function verificarCadeia(certPem: string, caPem: string, agora = new Date()): ResultadoCadeia {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    return { ok: false, motivo: "certificado-invalido" };
  }
  if (agora < cert.validity.notBefore || agora > cert.validity.notAfter) {
    return { ok: false, motivo: "fora-da-validade", cnpj: cnpjDoCertificado(cert) };
  }
  try {
    const ca = forge.pki.certificateFromPem(caPem);
    if (!ca.verify(cert)) return { ok: false, motivo: "ac-desconhecida" };
  } catch {
    return { ok: false, motivo: "ac-desconhecida" };
  }
  return { ok: true, cnpj: cnpjDoCertificado(cert) };
}
