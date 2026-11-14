import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { verificarCadeia } from "../../comum/certificado";
import { ErroXml } from "../../comum/xml";
import {
  abrirEnvelope,
  contentTypeSoap,
  envelopeFalha,
  envelopeResposta,
  type NomeServico,
  SERVICOS,
} from "../../comum/soap";
import type { TipoCaos } from "./config";
import { paginaConsulta } from "./paginas";
import { consultarProtocolo, consultarRecibo, type Contexto, receberLote } from "./servicos";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sorteia (ou força) um comportamento caótico para a requisição de autorização. */
export function sortearCaos(c: Contexto["config"]["caos"], aleatorio = Math.random): TipoCaos | null {
  if (c.forcar) return c.forcar;
  if (!c.ativo || aleatorio() >= c.probabilidade) return null;
  const tipos: TipoCaos[] = ["atraso", "103", "derrubar-antes", "derrubar-depois"];
  return tipos[Math.floor(aleatorio() * tipos.length)] ?? "atraso";
}

/** Resposta cujo corpo falha de propósito: o cliente vê a conexão cair (ECONNRESET). */
function conexaoDerrubada(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("modo caos: conexão derrubada de propósito"));
      },
    }),
    { headers: { "content-type": "application/soap+xml; charset=utf-8" } },
  );
}

/**
 * No modo "proxy", o proxy reverso já fez o TLS mútuo e repassa o resultado em
 * cabeçalhos. Conferimos de novo a cadeia do certificado repassado (defesa em profundidade).
 */
function certificadoDoProxyValido(req: Request, ctx: Contexto): boolean {
  const { config } = ctx;
  if (config.proxySegredo && req.headers.get("x-proxy-segredo") !== config.proxySegredo) return false;
  if ((req.headers.get("x-ssl-client-verify") ?? "").toUpperCase() !== "SUCCESS") return false;
  const bruto = req.headers.get("x-ssl-client-cert") ?? "";
  if (!bruto) return false;
  let pem: string;
  try {
    pem = decodeURIComponent(bruto);
  } catch {
    return false;
  }
  // Alguns proxies mandam o PEM numa linha só, com espaços no lugar das quebras.
  if (!pem.includes("\n")) {
    const corpo = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    pem = `-----BEGIN CERTIFICATE-----\n${corpo.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----\n`;
  }
  return verificarCadeia(pem, config.caPem).ok;
}

/** App do web service SOAP (fica atrás do TLS mútuo). */
export function criarAppWs(ctx: Contexto): Hono {
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.text("lote muito grande", 413) }));

  if (ctx.config.mtlsModo === "proxy") {
    app.use("/ws/*", async (c, next) => {
      if (!certificadoDoProxyValido(c.req.raw, ctx)) {
        ctx.log.aviso("ws.certificado_recusado", { ip: c.req.header("x-forwarded-for") ?? null });
        return c.body(envelopeFalha("Rejeição: Certificado Transmissor inválido"), 403, {
          "content-type": "application/soap+xml; charset=utf-8",
        });
      }
      await next();
    });
  }

  const responder = (servico: NomeServico, xml: string) =>
    new Response(envelopeResposta(servico, xml), { headers: { "content-type": contentTypeSoap(servico) } });

  const falha = (motivo: string) =>
    new Response(envelopeFalha(motivo), {
      status: 400,
      headers: { "content-type": "application/soap+xml; charset=utf-8" },
    });

  const abrir = async (req: Request, servico: NomeServico) => {
    const corpo = await req.text();
    return abrirEnvelope(corpo, { servico, dentroDe: "nfeDadosMsg" }).elemento;
  };

  app.post(SERVICOS.autorizacao.caminho, async (c) => {
    let conteudo: Element;
    try {
      conteudo = await abrir(c.req.raw, "autorizacao");
    } catch (e) {
      ctx.log.aviso("ws.envelope_invalido", { servico: "autorizacao", erro: (e as Error).message });
      return falha("Envelope SOAP inválido");
    }
    const caos = sortearCaos(ctx.config.caos);
    if (caos) ctx.log.info("caos", { tipo: caos });
    if (caos === "derrubar-antes") return conexaoDerrubada();
    const xml = receberLote(conteudo, ctx, { assincrono: caos === "103" });
    if (caos === "derrubar-depois") return conexaoDerrubada();
    if (caos === "atraso") {
      const max = ctx.config.caos.atrasoMaxMs;
      await dormir(Math.round(max / 4 + Math.random() * (max * 3) / 4));
    }
    return responder("autorizacao", xml);
  });

  app.post(SERVICOS.retAutorizacao.caminho, async (c) => {
    try {
      return responder("retAutorizacao", consultarRecibo(await abrir(c.req.raw, "retAutorizacao"), ctx));
    } catch (e) {
      if (!(e instanceof ErroXml)) throw e;
      return falha("Envelope SOAP inválido");
    }
  });

  app.post(SERVICOS.consultaProtocolo.caminho, async (c) => {
    try {
      return responder("consultaProtocolo", consultarProtocolo(await abrir(c.req.raw, "consultaProtocolo"), ctx));
    } catch (e) {
      if (!(e instanceof ErroXml)) throw e;
      return falha("Envelope SOAP inválido");
    }
  });

  app.notFound((c) => c.text("Serviço não encontrado", 404));
  return app;
}

/** App público: página de consulta por chave de acesso. */
export function criarAppPublico(ctx: Contexto): Hono {
  const app = new Hono();
  app.get("/saude", (c) => c.json({ ok: true }));
  app.get("/", (c) => c.html(paginaConsulta({ ctx })));
  app.get("/consulta", (c) => c.html(paginaConsulta({ ctx, chave: c.req.query("chave") ?? "" })));
  app.notFound((c) => c.html(paginaConsulta({ ctx, naoEncontrada: true }), 404));
  return app;
}
