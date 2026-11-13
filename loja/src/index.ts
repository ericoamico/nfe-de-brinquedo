import { carregarPfx } from "../../comum/certificado";
import { criarLog } from "../../comum/log";
import { criarAppLoja } from "./app";
import { abrirBanco } from "./banco";
import { type ConfigLoja, configDoAmbiente } from "./config";
import { gerarDanfe } from "./danfe";
import { adaptadorDoAmbiente, criarServicoEmail, REMETENTE_PADRAO, type ServicoEmailNota } from "./email";
import { ClienteAutorizadora } from "./nfe/cliente";
import { Emissor } from "./nfe/emissor";

export interface LojaEmExecucao {
  url: string;
  emissor: Emissor;
  banco: ReturnType<typeof abrirBanco>;
  parar: () => Promise<void>;
}

export interface OpcoesLoja {
  /** Liga a fila de reprocessamento (padrão: sim). */
  fila?: boolean;
  /** Serviço de e-mail; por padrão vem de EMAIL_ADAPTADOR. */
  email?: ServicoEmailNota;
}

export function iniciarLoja(config: ConfigLoja, opcoes: OpcoesLoja = {}): LojaEmExecucao {
  const log = criarLog("loja");
  const certificado = carregarPfx(config.pfx, config.pfxSenha);
  if (certificado.cnpj !== config.emitente.cnpj) {
    throw new Error(`o CNPJ do certificado (${certificado.cnpj}) é diferente do CNPJ do emitente (${config.emitente.cnpj})`);
  }
  const banco = abrirBanco(config.banco);
  const danfe = (xmlProc: string) => gerarDanfe(xmlProc, { urlConsulta: config.urlConsulta });
  const email = opcoes.email ?? criarServicoEmail(adaptadorDoAmbiente(), process.env.EMAIL_REMETENTE || REMETENTE_PADRAO);
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
      const nota = banco.nota(pedidoId)!;
      const pedido = banco.pedido(pedidoId)!;
      const pdf = await danfe(nota.xml_proc!);
      const r = await email.enviarNota({ nome: pedido.nome, email: pedido.email }, pdf, nota.xml_proc!, {
        pedido: pedido.codigo,
        urlPedido: `${config.urlPublica}/pedido/${pedido.codigo}`,
        urlConsulta: `${config.urlConsulta}?chave=${nota.chave}`,
      });
      log.info("nota.email_enviado", { pedido: pedido.codigo, chave: nota.chave, envio: r.id });
    },
  });
  const app = criarAppLoja({ config, banco, emissor, log, gerarDanfe: danfe });
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
