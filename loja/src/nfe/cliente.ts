import { abrirEnvelope, contentTypeSoap, envelopeRequisicao, type NomeServico, SERVICOS } from "../../../comum/soap";
import { montarConsReciNFe, montarConsSitNFe } from "./montar";

/** Falha de comunicação: não sabemos se a autorizadora processou ou não o pedido. */
export class ErroComunicacao extends Error {
  constructor(
    public tipo: "timeout" | "conexao" | "http" | "resposta-invalida",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface OpcoesCliente {
  urlBase: string;
  certPem: string;
  chavePem: string;
  caPem: string;
  timeoutMs: number;
  tpAmb: number;
}

/** Cliente SOAP 1.2 com TLS mútuo para os web services da autorizadora. */
export class ClienteAutorizadora {
  constructor(private o: OpcoesCliente) {}

  private async chamar(servico: NomeServico, mensagem: string, timeoutMs = this.o.timeoutMs): Promise<Element> {
    let resposta: Response;
    try {
      resposta = await fetch(this.o.urlBase + SERVICOS[servico].caminho, {
        method: "POST",
        headers: { "content-type": contentTypeSoap(servico) },
        body: envelopeRequisicao(servico, mensagem),
        signal: AbortSignal.timeout(timeoutMs),
        tls: { cert: this.o.certPem, key: this.o.chavePem, ca: this.o.caPem },
      } as RequestInit);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new ErroComunicacao("timeout", `sem resposta em ${timeoutMs} ms`);
      }
      throw new ErroComunicacao("conexao", `${err.code ?? err.name}: ${err.message}`);
    }
    let corpo: string;
    try {
      corpo = await resposta.text();
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new ErroComunicacao("timeout", `resposta incompleta em ${timeoutMs} ms`);
      }
      throw new ErroComunicacao("conexao", `conexão caiu durante a resposta: ${err.code ?? err.message}`);
    }
    if (!resposta.ok) throw new ErroComunicacao("http", `HTTP ${resposta.status}: ${corpo.slice(0, 300)}`);
    try {
      return abrirEnvelope(corpo, { servico, dentroDe: "nfeResultMsg" }).elemento;
    } catch (e) {
      throw new ErroComunicacao("resposta-invalida", (e as Error).message);
    }
  }

  /** NFeAutorizacao4 (envio do lote). */
  autorizar(enviNFe: string): Promise<Element> {
    return this.chamar("autorizacao", enviNFe);
  }

  /** NFeRetAutorizacao4 (resultado do lote pelo recibo). */
  consultarRecibo(nRec: string): Promise<Element> {
    return this.chamar("retAutorizacao", montarConsReciNFe(nRec, this.o.tpAmb));
  }

  /** NFeConsultaProtocolo4 (situação da NF-e pela chave). */
  consultarChave(chave: string): Promise<Element> {
    return this.chamar("consultaProtocolo", montarConsSitNFe(chave, this.o.tpAmb));
  }
}
