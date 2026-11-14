import { AdaptadorArquivo, AdaptadorSmtp } from "./adaptadores";
import { montarEmailNota } from "./modelo";
import type { AdaptadorEmail, ServicoEmailNota } from "./tipos";

export type { AdaptadorEmail, Destinatario, ExtrasNota, MensagemEmail, ServicoEmailNota } from "./tipos";
export { AdaptadorArquivo, AdaptadorSmtp } from "./adaptadores";
export { ASSUNTO_NOTA, montarEmailNota } from "./modelo";

export const REMETENTE_PADRAO = '"Loja do Érico (fictícia)" <nao-responda@loja.invalid>';

/** Escolhe o adaptador pela variável EMAIL_ADAPTADOR ("arquivo" por padrão, ou "smtp"). */
export function adaptadorDoAmbiente(env = process.env): AdaptadorEmail {
  const tipo = (env.EMAIL_ADAPTADOR ?? "arquivo").toLowerCase();
  if (tipo === "arquivo") return new AdaptadorArquivo(env.EMAIL_PASTA ?? "dados/emails");
  if (tipo === "smtp") {
    if (!env.SMTP_HOST) throw new Error("EMAIL_ADAPTADOR=smtp exige SMTP_HOST");
    return new AdaptadorSmtp({
      host: env.SMTP_HOST,
      porta: Number(env.SMTP_PORTA ?? 587),
      seguro: env.SMTP_SEGURO === "1",
      exigirTls: env.SMTP_EXIGIR_TLS !== "0",
      usuario: env.SMTP_USUARIO || undefined,
      senha: env.SMTP_SENHA || undefined,
      responderPara: env.EMAIL_RESPONDER_PARA || undefined,
    });
  }
  throw new Error(`EMAIL_ADAPTADOR desconhecido: ${tipo} (use "arquivo" ou "smtp")`);
}

/** Serviço usado pela loja: monta o e-mail da nota e entrega pelo adaptador escolhido. */
export function criarServicoEmail(adaptador: AdaptadorEmail, remetente = REMETENTE_PADRAO): ServicoEmailNota {
  return {
    enviarNota: (destinatario, pdf, xml, extras) =>
      adaptador.enviar(montarEmailNota(destinatario, pdf, xml, extras), remetente),
  };
}
