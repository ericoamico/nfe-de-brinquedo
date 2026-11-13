/**
 * Interface do envio de e-mail. A loja só conhece esta interface; o serviço de
 * e-mail de verdade é escolhido por variável de ambiente (EMAIL_ADAPTADOR).
 */

export interface Anexo {
  nome: string;
  conteudo: Uint8Array | string;
  tipo: string;
}

export interface MensagemEmail {
  para: { nome: string; email: string };
  assunto: string;
  html: string;
  texto: string;
  anexos: Anexo[];
}

export interface ResultadoEnvio {
  /** Identificador do envio (Message-ID do SMTP ou pasta onde o e-mail foi salvo). */
  id: string;
}

/** Um adaptador sabe entregar uma mensagem pronta. Para plugar outro serviço, implemente isto. */
export interface AdaptadorEmail {
  readonly nome: string;
  enviar(mensagem: MensagemEmail, remetente: string): Promise<ResultadoEnvio>;
}

export interface Destinatario {
  nome: string;
  email: string;
}

export interface ExtrasNota {
  /** Número do pedido na loja. */
  pedido?: string;
  /** Link da página do pedido. */
  urlPedido?: string;
  /** Link da consulta pública da nota. */
  urlConsulta?: string;
}

/** O que a loja usa: enviar a nota fiscal (PDF do DANFE + XML) para o cliente. */
export interface ServicoEmailNota {
  enviarNota(destinatario: Destinatario, pdf: Uint8Array, xml: string, extras?: ExtrasNota): Promise<ResultadoEnvio>;
}
