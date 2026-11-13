import { readFileSync } from "node:fs";
import type { Emitente } from "./nfe/montar";

export interface ConfigLoja {
  porta: number;
  host: string;
  /** Endereço público da loja (links nos e-mails). */
  urlPublica: string;
  /** Página pública de consulta da autorizadora (vai no QR Code do DANFE). */
  urlConsulta: string;
  banco: string;
  pfx: string | Uint8Array;
  pfxSenha: string;
  /** AC de brinquedo (cadeia do certificado da loja). */
  caPem: string;
  /**
   * Em quem confiar ao conectar na autorizadora. Padrão: a AC de brinquedo (opção 1, TLS
   * mútuo direto). `undefined` = ACs públicas do sistema (opção 2, atrás de proxy com HTTPS público).
   */
  caServidorPem: string | undefined;
  urlAutorizadora: string;
  timeoutMs: number;
  tpAmb: 1 | 2;
  serie: number;
  /** Quanto tempo a tela de confirmação espera a nota antes de seguir em segundo plano. */
  esperaCheckoutMs: number;
  /** De quanto em quanto tempo a fila de reprocessamento roda. */
  intervaloFilaMs: number;
  /** Quantas vezes consultar o recibo (cStat 103) antes de deixar para a fila. */
  tentativasRecibo: number;
  intervaloReciboMs: number;
  cookieSeguro: boolean;
  emitente: Emitente;
}

/** Emitente fictício. O CNPJ precisa ser o mesmo do certificado da loja. */
export function emitentePadrao(cnpj = "99999001000159"): Emitente {
  return {
    cnpj,
    razaoSocial: "LOJA DO ERICO (FICTICIA) LTDA",
    nomeFantasia: "Loja do Érico (fictícia)",
    ie: "990001112",
    crt: 1,
    cUF: 99,
    endereco: {
      logradouro: "Rua dos Brinquedos",
      numero: "100",
      complemento: "Sala 1",
      bairro: "Centro",
      codigoMunicipio: "9900001",
      municipio: "Cidade de Brinquedo",
      uf: "ZZ",
      cep: "99000000",
      telefone: "9900000000",
    },
  };
}

export function configDoAmbiente(env = process.env): ConfigLoja {
  const pasta = env.AC_SAIDA ?? "ac/saida";
  const porta = Number(env.LOJA_PORTA ?? 3000);
  // O .pfx pode vir de um arquivo ou direto em base64 (útil em secrets).
  const pfx = env.LOJA_PFX_BASE64 ? Buffer.from(env.LOJA_PFX_BASE64, "base64") : (env.LOJA_PFX ?? `${pasta}/loja.pfx`);
  return {
    porta,
    host: env.LOJA_HOST ?? "127.0.0.1",
    urlPublica: (env.LOJA_URL_PUBLICA ?? `http://localhost:${porta}`).replace(/\/$/, ""),
    urlConsulta: env.LOJA_URL_CONSULTA ?? "http://localhost:3001/consulta",
    banco: env.LOJA_BANCO ?? "dados/loja.sqlite",
    pfx,
    pfxSenha: env.LOJA_PFX_SENHA ?? "brinquedo",
    caPem: readFileSync(env.LOJA_CA ?? `${pasta}/raiz.crt`, "utf8"),
    caServidorPem:
      env.LOJA_CA_SERVIDOR === "sistema"
        ? undefined
        : readFileSync(env.LOJA_CA_SERVIDOR || env.LOJA_CA || `${pasta}/raiz.crt`, "utf8"),
    urlAutorizadora: (env.LOJA_AUTORIZADORA_URL ?? "https://localhost:8443").replace(/\/$/, ""),
    timeoutMs: Number(env.LOJA_TIMEOUT_MS ?? 10_000),
    tpAmb: env.LOJA_TP_AMB === "1" ? 1 : 2,
    serie: Number(env.LOJA_SERIE ?? 1),
    esperaCheckoutMs: Number(env.LOJA_ESPERA_CHECKOUT_MS ?? 12_000),
    intervaloFilaMs: Number(env.LOJA_INTERVALO_FILA_MS ?? 30_000),
    tentativasRecibo: Number(env.LOJA_TENTATIVAS_RECIBO ?? 3),
    intervaloReciboMs: Number(env.LOJA_INTERVALO_RECIBO_MS ?? 1500),
    cookieSeguro: env.LOJA_COOKIE_SEGURO === "1",
    emitente: emitentePadrao(env.LOJA_CNPJ ?? "99999001000159"),
  };
}
