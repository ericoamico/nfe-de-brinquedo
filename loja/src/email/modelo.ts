import { formatarCNPJ } from "../../../comum/documentos";
import { escapar, filho, parsear, primeiro, textoFilho, todos } from "../../../comum/xml";
import type { Destinatario, ExtrasNota, MensagemEmail } from "./tipos";

export const ASSUNTO_NOTA = "Sua nota fiscal - Loja do Érico (fictícia)";

const reais = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (dh: string) => (dh ? `${dh.slice(8, 10)}/${dh.slice(5, 7)}/${dh.slice(0, 4)}` : "");
const AVISO_RODAPE =
  "Este e-mail e os arquivos anexos são documentos de brinquedo, sem valor fiscal, emitidos por uma loja fictícia criada para estudo. Nenhum produto foi vendido nem cobrado de verdade.";

/** Monta o e-mail da nota (HTML simples e acessível + versão em texto puro) a partir do XML autorizado. */
export function montarEmailNota(dest: Destinatario, pdf: Uint8Array, xml: string, extras: ExtrasNota = {}): MensagemEmail {
  const doc = parsear(xml);
  const inf = primeiro(doc, "infNFe")!;
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const tot = primeiro(filho(inf, "total"), "ICMSTot");
  const numero = textoFilho(ide, "nNF");
  const serie = textoFilho(ide, "serie");
  const emissao = data(textoFilho(ide, "dhEmi"));
  const total = reais(textoFilho(tot, "vNF"));
  const itens = todos(inf, "det").map((d) => {
    const p = filho(d, "prod");
    return { qtd: Number(textoFilho(p, "qCom")), nome: textoFilho(p, "xProd"), valor: reais(textoFilho(p, "vProd")) };
  });
  const primeiroNome = dest.nome.split(" ")[0] ?? dest.nome;
  const cnpj = formatarCNPJ(textoFilho(emit, "CNPJ"));
  const pedido = extras.pedido ? ` do pedido ${extras.pedido}` : "";

  const texto = [
    `Olá, ${primeiroNome}!`,
    "",
    `A nota fiscal${pedido} foi emitida e está anexada a este e-mail, em PDF e em XML.`,
    "",
    "Resumo da nota",
    extras.pedido ? `- Pedido: ${extras.pedido}` : null,
    `- Nota fiscal: nº ${numero}, série ${serie}`,
    `- Emitida em: ${emissao}`,
    `- Valor total: ${total}`,
    "",
    "Itens",
    ...itens.map((i) => `- ${i.qtd}x ${i.nome}: ${i.valor}`),
    "",
    "O arquivo PDF é a versão para imprimir ou guardar. O arquivo XML é a nota fiscal eletrônica propriamente dita: guarde os dois.",
    extras.urlPedido ? `\nAcompanhe o pedido: ${extras.urlPedido}` : null,
    extras.urlConsulta ? `Consulte a autenticidade da nota: ${extras.urlConsulta}` : null,
    "",
    "Obrigado pela compra!",
    "Loja do Érico (fictícia)",
    "",
    "--",
    `Loja do Érico (fictícia) - CNPJ ${cnpj}`,
    AVISO_RODAPE,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const e = escapar;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(ASSUNTO_NOTA)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif;color:#1e2329;font-size:16px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #dcd7cf;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:bold;font-size:18px;color:#1d4f91">Loja do Érico (fictícia)</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Olá, ${e(primeiroNome)}! Sua nota fiscal chegou.</h1>
<p style="margin:0 0 16px">A nota fiscal${e(pedido)} foi emitida e está anexada a este e-mail, em PDF e em XML.</p>
<h2 style="font-size:18px;margin:24px 0 8px">Resumo da nota</h2>
<table style="border-collapse:collapse;width:100%">
<tbody>
${extras.pedido ? `<tr><th scope="row" style="text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid #eee">Pedido</th><td style="padding:6px 0;border-bottom:1px solid #eee">${e(extras.pedido)}</td></tr>` : ""}
<tr><th scope="row" style="text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid #eee">Nota fiscal</th><td style="padding:6px 0;border-bottom:1px solid #eee">nº ${e(numero)}, série ${e(serie)}</td></tr>
<tr><th scope="row" style="text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid #eee">Emitida em</th><td style="padding:6px 0;border-bottom:1px solid #eee">${e(emissao)}</td></tr>
<tr><th scope="row" style="text-align:left;padding:6px 12px 6px 0">Valor total</th><td style="padding:6px 0;font-weight:bold">${e(total)}</td></tr>
</tbody>
</table>
<h2 style="font-size:18px;margin:24px 0 8px">Itens</h2>
<ul style="margin:0;padding-left:20px">
${itens.map((i) => `<li>${i.qtd}x ${e(i.nome)}: ${e(i.valor)}</li>`).join("\n")}
</ul>
<p style="margin:16px 0">O arquivo PDF é a versão para imprimir ou guardar. O arquivo XML é a nota fiscal eletrônica propriamente dita: guarde os dois.</p>
${extras.urlPedido ? `<p style="margin:16px 0"><a href="${e(extras.urlPedido)}" style="color:#1d4f91;font-weight:bold">Acompanhar o pedido</a></p>` : ""}
${extras.urlConsulta ? `<p style="margin:16px 0"><a href="${e(extras.urlConsulta)}" style="color:#1d4f91">Consultar a autenticidade da nota</a></p>` : ""}
<p style="margin:16px 0 0">Obrigado pela compra!<br>Loja do Érico (fictícia)</p>
</div>
<div role="contentinfo" style="padding:16px 8px;color:#57606a;font-size:13px">
<p style="margin:0 0 8px">Loja do Érico (fictícia), CNPJ ${e(cnpj)}.</p>
<p style="margin:0">${e(AVISO_RODAPE)}</p>
</div>
</div>
</body>
</html>`;

  return {
    para: dest,
    assunto: ASSUNTO_NOTA,
    html,
    texto,
    anexos: [
      { nome: `nota-fiscal-${numero}.pdf`, conteudo: pdf, tipo: "application/pdf" },
      { nome: `nota-fiscal-${numero}.xml`, conteudo: xml, tipo: "application/xml" },
    ],
  };
}
