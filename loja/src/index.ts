import { carregarPfx } from "../../comum/certificado";
import { criarLog } from "../../comum/log";
import { criarAppLoja } from "./app";
import { abrirBanco } from "./banco";
import { type ConfigLoja, configDoAmbiente } from "./config";
import { ClienteAutorizadora } from "./nfe/cliente";
import { Emissor } from "./nfe/emissor";

export interface LojaEmExecucao {
  url: string;
  emissor: Emissor;
  banco: ReturnType<typeof abrirBanco>;
  parar: () => Promise<void>;
}

export function iniciarLoja(config: ConfigLoja, opcoes: { fila?: boolean } = {}): LojaEmExecucao {
  const log = criarLog("loja");
  const certificado = carregarPfx(config.pfx, config.pfxSenha);
  if (certificado.cnpj !== config.emitente.cnpj) {
    throw new Error(`o CNPJ do certificado (${certificado.cnpj}) é diferente do CNPJ do emitente (${config.emitente.cnpj})`);
  }
  const banco = abrirBanco(config.banco);
  const cliente = new ClienteAutorizadora({
    urlBase: config.urlAutorizadora,
    certPem: certificado.certPem,
    chavePem: certificado.chavePem,
    caPem: config.caPem,
    timeoutMs: config.timeoutMs,
    tpAmb: config.tpAmb,
  });
  const emissor = new Emissor({
    banco,
    cliente,
    certificado,
    config,
    log,
    aposAutorizar: async (pedidoId) => {
      log.info("nota.pronta_para_entrega", { pedidoId });
    },
  });
  const app = criarAppLoja({ config, banco, emissor, log });
  const servidor = Bun.serve({ port: config.porta, hostname: config.host, fetch: app.fetch, development: false });
  if (opcoes.fila !== false) emissor.iniciarFila();
  const url = `http://${config.host}:${servidor.port}`;
  log.info("iniciada", { url, autorizadora: config.urlAutorizadora, certificadoValidoAte: certificado.validoAte });
  return {
    url,
    emissor,
    banco,
    parar: async () => {
      emissor.pararFila();
      await emissor.aguardar();
      servidor.stop(true);
      banco.fechar();
    },
  };
}

if (import.meta.main) {
  iniciarLoja(configDoAmbiente());
}
