import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type TipoCaos = "atraso" | "103" | "derrubar-antes" | "derrubar-depois";

export interface ConfigAutorizadora {
  /** Porta do web service (TLS mútuo no modo "direto"). */
  portaWs: number;
  hostWs: string;
  /** Porta HTTP da página pública de consulta (fica atrás do proxy reverso). */
  portaPublica: number;
  hostPublico: string;
  /** "direto": a autorizadora termina o TLS mútuo. "proxy": o proxy verifica o certificado e repassa. */
  mtlsModo: "direto" | "proxy";
  proxySegredo?: string;
  certPem: string;
  chavePem: string;
  caPem: string;
  banco: string;
  tpAmb: 1 | 2;
  cUF: number;
  /** Tempo até um lote assíncrono (cStat 103) ficar pronto. */
  loteAssincronoMs: number;
  caos: {
    ativo: boolean;
    probabilidade: number;
    atrasoMaxMs: number;
    /** Para testes: força um tipo de caos em toda requisição de autorização. */
    forcar?: TipoCaos;
  };
}

const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8");

export function configDoAmbiente(env = process.env): ConfigAutorizadora {
  const pasta = env.AC_SAIDA ?? "ac/saida";
  const modo = (env.AUT_MTLS_MODO ?? "direto") as "direto" | "proxy";
  if (modo !== "direto" && modo !== "proxy") throw new Error("AUT_MTLS_MODO deve ser 'direto' ou 'proxy'");
  return {
    portaWs: Number(env.AUT_PORTA_WS ?? 8443),
    hostWs: env.AUT_HOST_WS ?? (modo === "proxy" ? "127.0.0.1" : "0.0.0.0"),
    portaPublica: Number(env.AUT_PORTA_PUBLICA ?? 3001),
    hostPublico: env.AUT_HOST_PUBLICO ?? "127.0.0.1",
    mtlsModo: modo,
    proxySegredo: env.AUT_PROXY_SEGREDO || undefined,
    // Usados no TLS (modo direto) e, nos dois modos, para assinar o protocolo de autorização.
    certPem: ler(env.AUT_CERT ?? `${pasta}/autorizadora.crt`),
    chavePem: ler(env.AUT_CHAVE ?? `${pasta}/autorizadora.key`),
    caPem: ler(env.AUT_CA ?? `${pasta}/raiz.crt`),
    banco: env.AUT_BANCO ?? "dados/autorizadora.sqlite",
    tpAmb: env.AUT_TP_AMB === "1" ? 1 : 2,
    cUF: 99,
    loteAssincronoMs: Number(env.AUT_LOTE_ASSINCRONO_MS ?? 3000),
    caos: {
      ativo: env.AUT_CAOS === "1",
      probabilidade: Number(env.AUT_CAOS_PROBABILIDADE ?? 0.3),
      atrasoMaxMs: Number(env.AUT_CAOS_ATRASO_MAX_MS ?? 20000),
      forcar: (env.AUT_CAOS_FORCAR || undefined) as TipoCaos | undefined,
    },
  };
}
