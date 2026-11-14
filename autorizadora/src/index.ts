import { criarLog } from "../../comum/log";
import { criarAppPublico, criarAppWs } from "./app";
import { abrirBanco } from "./banco";
import { type ConfigAutorizadora, configDoAmbiente } from "./config";
import type { Contexto } from "./servicos";

export interface AutorizadoraEmExecucao {
  ctx: Contexto;
  urlWs: string;
  urlPublica: string;
  parar: () => void;
}

/** Sobe os dois servidores: o web service (TLS mútuo) e a página pública de consulta. */
export function iniciarAutorizadora(config: ConfigAutorizadora): AutorizadoraEmExecucao {
  const log = criarLog("autorizadora");
  const ctx: Contexto = { config, banco: abrirBanco(config.banco), log };
  const ws = criarAppWs(ctx);
  const publico = criarAppPublico(ctx);

  const servidorWs = Bun.serve({
    port: config.portaWs,
    hostname: config.hostWs,
    fetch: ws.fetch,
    development: false,
    ...(config.mtlsModo === "direto"
      ? {
          tls: {
            cert: config.certPem,
            key: config.chavePem,
            ca: config.caPem,
            requestCert: true,
            rejectUnauthorized: true,
          },
        }
      : {}),
  });
  const servidorPublico = Bun.serve({
    port: config.portaPublica,
    hostname: config.hostPublico,
    fetch: publico.fetch,
    development: false,
  });

  const esquemaWs = config.mtlsModo === "direto" ? "https" : "http";
  const urlWs = `${esquemaWs}://${config.hostWs === "0.0.0.0" ? "localhost" : config.hostWs}:${servidorWs.port}`;
  const urlPublica = `http://${config.hostPublico}:${servidorPublico.port}`;
  log.info("iniciada", {
    ws: urlWs,
    mtls: config.mtlsModo,
    consulta: urlPublica,
    caos: config.caos.ativo ? config.caos : false,
  });
  return {
    ctx,
    urlWs,
    urlPublica,
    parar: () => {
      servidorWs.stop(true);
      servidorPublico.stop(true);
      ctx.banco.fechar();
    },
  };
}

if (import.meta.main) {
  iniciarAutorizadora(configDoAmbiente());
}
