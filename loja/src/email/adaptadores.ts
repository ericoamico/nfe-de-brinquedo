import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { AdaptadorEmail, MensagemEmail, ResultadoEnvio } from "./tipos";

const paraNodemailer = (m: MensagemEmail, remetente: string, responderPara?: string) => ({
  from: remetente,
  to: { name: m.para.nome, address: m.para.email },
  replyTo: responderPara,
  subject: m.assunto,
  text: m.texto,
  html: m.html,
  attachments: m.anexos.map((a) => ({
    filename: a.nome,
    content: typeof a.conteudo === "string" ? a.conteudo : Buffer.from(a.conteudo),
    contentType: a.tipo,
  })),
});

/**
 * Adaptador "arquivo" (desenvolvimento e testes): em vez de enviar, salva cada
 * e-mail numa pasta própria com mensagem.html, mensagem.txt, cabecalhos.json,
 * os anexos e um mensagem.eml completo (abre em qualquer programa de e-mail).
 */
export class AdaptadorArquivo implements AdaptadorEmail {
  readonly nome = "arquivo";
  constructor(private pasta: string) {}

  async enviar(m: MensagemEmail, remetente: string): Promise<ResultadoEnvio> {
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const sufixo = m.para.email.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);
    const dir = join(this.pasta, `${carimbo}-${sufixo}-${crypto.randomUUID().slice(0, 8)}`);
    await mkdir(join(dir, "anexos"), { recursive: true });

    const eml = await nodemailer
      .createTransport({ streamTransport: true, buffer: true, newline: "unix" })
      .sendMail(paraNodemailer(m, remetente));

    await Promise.all([
      writeFile(join(dir, "mensagem.html"), m.html),
      writeFile(join(dir, "mensagem.txt"), m.texto),
      writeFile(join(dir, "mensagem.eml"), eml.message as Buffer),
      writeFile(
        join(dir, "cabecalhos.json"),
        JSON.stringify(
          { de: remetente, para: m.para, assunto: m.assunto, data: new Date().toISOString(), anexos: m.anexos.map((a) => a.nome) },
          null,
          2,
        ),
      ),
      ...m.anexos.map((a) => writeFile(join(dir, "anexos", a.nome), a.conteudo)),
    ]);
    return { id: dir };
  }
}

export interface ConfigSmtp {
  host: string;
  porta: number;
  /** true = TLS direto (porta 465); false = STARTTLS quando o servidor oferecer (porta 587). */
  seguro: boolean;
  /** Exige STARTTLS quando não é TLS direto (padrão: sim). Desligue só para servidores locais de teste. */
  exigirTls?: boolean;
  usuario?: string;
  senha?: string;
  responderPara?: string;
}

/** Adaptador SMTP genérico: serve para qualquer provedor que fale SMTP. */
export class AdaptadorSmtp implements AdaptadorEmail {
  readonly nome = "smtp";
  private transporte;
  constructor(private c: ConfigSmtp) {
    this.transporte = nodemailer.createTransport({
      host: c.host,
      port: c.porta,
      secure: c.seguro,
      requireTLS: !c.seguro && c.exigirTls !== false,
      auth: c.usuario ? { user: c.usuario, pass: c.senha ?? "" } : undefined,
    });
  }

  async enviar(m: MensagemEmail, remetente: string): Promise<ResultadoEnvio> {
    const info = await this.transporte.sendMail(paraNodemailer(m, remetente, this.c.responderPara));
    return { id: info.messageId };
  }
}
