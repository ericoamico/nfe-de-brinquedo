import { assinarXml, verificarAssinatura } from "../../comum/assinatura";
import { chaveValida, montarChave } from "../../comum/chave";
import { cpfValido } from "../../comum/documentos";
import type { Log } from "../../comum/log";
import { NS_NFE, VER_APLIC, VERSAO } from "../../comum/soap";
import { el, filho, parsear, primeiro, serializar, texto, textoFilho, todos } from "../../comum/xml";
import type { BancoAutorizadora } from "./banco";
import type { ConfigAutorizadora } from "./config";

export interface Contexto {
  config: ConfigAutorizadora;
  banco: BancoAutorizadora;
  log: Log;
  agora?: () => Date;
}

/** Mensagens oficiais (Manual de Orientação do Contribuinte) usadas pela autorizadora. */
export const MOTIVOS: Record<number, string> = {
  100: "Autorizado o uso da NF-e",
  103: "Lote recebido com sucesso",
  104: "Lote processado",
  105: "Lote em processamento",
  106: "Lote não localizado",
  213: "Rejeição: CNPJ-Base do Emitente difere do CNPJ-Base do Certificado Digital",
  215: "Rejeição: Falha no schema XML",
  217: "Rejeição: NF-e não consta na base de dados da SEFAZ",
  225: "Rejeição: Falha no Schema XML do lote de NFe",
  226: "Rejeição: Código da UF do Emitente diverge da UF autorizadora",
  236: "Rejeição: Chave de Acesso com dígito verificador inválido",
  237: "Rejeição: CPF do destinatário inválido",
  239: "Rejeição: Cabeçalho - Versão do arquivo XML não suportada",
  252: "Rejeição: Ambiente informado diverge do Ambiente de recebimento",
  253: "Rejeição: Digito Verificador da chave de acesso composta inválida",
  452: "Rejeição: Solicitada resposta síncrona para Lote com mais de uma NF-e (indSinc=1)",
  502: "Rejeição: Erro na Chave de Acesso - Campo Id não corresponde à concatenação dos campos correspondentes",
  535: "Rejeição: Total do Frete difere do somatório dos itens",
  564: "Rejeição: Total do Produto / Serviço difere do somatório dos itens",
  610: "Rejeição: Total da NF difere do somatório dos Valores compõe o valor Total da NF.",
  629: "Rejeição: Valor do Produto difere do produto Valor Unitário de Comercialização e Quantidade Comercial",
  703: "Rejeição: Data-Hora de Emissão posterior ao horário de recebimento",
  865: "Rejeição: Total dos pagamentos menor que o total da nota",
  999: "Rejeição: Erro não catalogado",
};

const agoraDe = (ctx: Contexto) => (ctx.agora ? ctx.agora() : new Date());

/** Data/hora no formato do leiaute, horário de Brasília. */
export function dataHora(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19) + "-03:00";
}

const centavos = (s: string) => (s === "" ? 0 : Math.round(Number(s) * 100));

type Resultado =
  | { ok: true; dados: DadosValidados }
  | { ok: false; cStat: number; xMotivo: string; chave: string | null };

interface DadosValidados {
  chave: string;
  cnpj: string;
  modelo: string;
  serie: number;
  numero: number;
  emitente: string;
  destinatario: string;
  cpfDest: string;
  valor: string;
  dhEmi: string;
  digVal: string;
  xmlNFe: string;
}

const rejeitar = (cStat: number, chave: string | null, complemento = ""): Resultado => ({
  ok: false,
  cStat,
  xMotivo: MOTIVOS[cStat]! + complemento,
  chave,
});

/**
 * Valida uma NF-e na ordem em que a autorizadora real faz as checagens mais
 * comuns: estrutura, ambiente/UF, chave, assinatura, certificado x emitente,
 * destinatário, totais, duplicidade e sequência de numeração.
 */
export function validarNFe(nfe: Element, ctx: Contexto): Resultado {
  const { config, banco } = ctx;
  const xmlNFe = serializar(nfe);
  const infNFe = filho(nfe, "infNFe");
  const ide = filho(infNFe, "ide");
  const emit = filho(infNFe, "emit");
  const dest = filho(infNFe, "dest");
  const icmsTot = primeiro(filho(infNFe, "total"), "ICMSTot");
  if (!infNFe || !ide || !emit || !dest || !icmsTot || infNFe.getAttribute("versao") !== VERSAO) {
    return rejeitar(215, null);
  }
  const chaveId = (infNFe.getAttribute("Id") ?? "").replace(/^NFe/, "");

  const tpAmb = Number(textoFilho(ide, "tpAmb"));
  if (tpAmb !== config.tpAmb) return rejeitar(252, chaveId || null);
  const cUF = Number(textoFilho(ide, "cUF"));
  if (cUF !== config.cUF) return rejeitar(226, chaveId || null);

  // Chave de acesso: DV e composição.
  if (!/^\d{44}$/.test(chaveId)) return rejeitar(502, null);
  if (!chaveValida(chaveId)) return rejeitar(253, chaveId);
  const cnpj = textoFilho(emit, "CNPJ");
  const modelo = textoFilho(ide, "mod");
  const serie = Number(textoFilho(ide, "serie"));
  const numero = Number(textoFilho(ide, "nNF"));
  const dhEmi = textoFilho(ide, "dhEmi");
  const composta = /^\d{14}$/.test(cnpj)
    ? montarChave({
        cUF,
        aamm: dhEmi.slice(2, 4) + dhEmi.slice(5, 7),
        cnpj,
        modelo,
        serie,
        numero,
        tpEmis: textoFilho(ide, "tpEmis"),
        cNF: textoFilho(ide, "cNF"),
      })
    : "";
  if (composta !== chaveId || textoFilho(ide, "cDV") !== chaveId.slice(-1)) return rejeitar(502, chaveId);

  // Assinatura digital e certificado.
  const assinatura = verificarAssinatura(xmlNFe, "infNFe", config.caPem);
  if (!assinatura.ok) return rejeitar(assinatura.cStat!, chaveId);
  if (!assinatura.cnpj || assinatura.cnpj.slice(0, 8) !== cnpj.slice(0, 8)) return rejeitar(213, chaveId);

  // Data de emissão (tolerância de 5 minutos para relógios adiantados).
  const emissao = Date.parse(dhEmi);
  if (Number.isNaN(emissao)) return rejeitar(215, chaveId);
  if (emissao > agoraDe(ctx).getTime() + 5 * 60_000) return rejeitar(703, chaveId);

  // Destinatário.
  const cpfDest = textoFilho(dest, "CPF");
  if (!cpfValido(cpfDest)) return rejeitar(237, chaveId);

  // Totais: cada item, soma dos itens, total da nota e pagamentos.
  let somaProd = 0;
  let somaFrete = 0;
  for (const det of todos(infNFe, "det")) {
    const prod = filho(det, "prod");
    const vProd = centavos(textoFilho(prod, "vProd"));
    const esperado = Math.round(Number(textoFilho(prod, "qCom")) * Number(textoFilho(prod, "vUnCom")) * 100);
    if (Math.abs(esperado - vProd) > 1) return rejeitar(629, chaveId, ` [nItem:${det.getAttribute("nItem")}]`);
    if (textoFilho(prod, "indTot") !== "0") somaProd += vProd;
    somaFrete += centavos(textoFilho(prod, "vFrete"));
  }
  const tot = (nome: string) => centavos(textoFilho(icmsTot, nome));
  if (somaProd !== tot("vProd")) return rejeitar(564, chaveId);
  if (somaFrete !== tot("vFrete")) return rejeitar(535, chaveId);
  const vNFCalculado =
    tot("vProd") - tot("vDesc") - tot("vICMSDeson") + tot("vST") + tot("vFCPST") + tot("vFrete") +
    tot("vSeg") + tot("vOutro") + tot("vII") + tot("vIPI") + tot("vIPIDevol");
  if (vNFCalculado !== tot("vNF")) return rejeitar(610, chaveId);
  const pago = todos(filho(infNFe, "pag") ?? infNFe, "vPag").reduce((s, e) => s + centavos(e.textContent ?? ""), 0);
  if (pago < tot("vNF")) return rejeitar(865, chaveId);

  return {
    ok: true,
    dados: {
      chave: chaveId,
      cnpj,
      modelo,
      serie,
      numero,
      emitente: textoFilho(emit, "xNome"),
      destinatario: textoFilho(dest, "xNome"),
      cpfDest,
      valor: textoFilho(icmsTot, "vNF"),
      dhEmi,
      digVal: texto(nfe, "DigestValue"),
      xmlNFe,
    },
  };
}

function montarProtNFe(
  ctx: Contexto,
  p: { chave: string | null; dhRecbto: string; cStat: number; xMotivo: string; nProt?: string; digVal?: string },
): string {
  const id = p.nProt ? `ID${p.nProt}` : undefined;
  const inf = el(
    "infProt",
    [
      el("tpAmb", ctx.config.tpAmb),
      el("verAplic", VER_APLIC),
      p.chave ? el("chNFe", p.chave) : "",
      el("dhRecbto", p.dhRecbto),
      p.nProt ? el("nProt", p.nProt) : "",
      p.digVal ? el("digVal", p.digVal) : "",
      el("cStat", p.cStat),
      el("xMotivo", p.xMotivo),
    ],
    { Id: id },
  );
  const prot = el("protNFe", [inf], { xmlns: NS_NFE, versao: VERSAO });
  // O protocolo de autorização sai assinado pela autorizadora, como na vida real.
  return p.nProt ? assinarXml(prot, "infProt", ctx.config.chavePem, ctx.config.certPem) : prot;
}

/**
 * Processa uma NF-e: valida, checa duplicidade/sequência e autoriza.
 * Devolve o protNFe (autorizado ou com a rejeição).
 */
export function processarNFe(nfe: Element, nRec: string, ctx: Contexto): { protNFe: string; cStat: number } {
  const { banco, log } = ctx;
  const dhRecbto = dataHora(agoraDe(ctx));
  const v = validarNFe(nfe, ctx);
  if (!v.ok) {
    banco.registrarRejeicao(v.chave, v.cStat, v.xMotivo);
    log.aviso("nfe.rejeitada", { chave: v.chave, cStat: v.cStat, xMotivo: v.xMotivo, nRec });
    return { protNFe: montarProtNFe(ctx, { chave: v.chave, dhRecbto, cStat: v.cStat, xMotivo: v.xMotivo }), cStat: v.cStat };
  }
  const d = v.dados;

  // Duplicidade, sequência e gravação numa transação só, para não haver corrida.
  const resultado = banco.db.transaction(() => {
    const mesmaChave = banco.notaPorChave(d.chave);
    if (mesmaChave) return { cStat: 204, xMotivo: `Rejeição: Duplicidade de NF-e [nRec:${mesmaChave.nrec}]` };
    const mesmoNumero = banco.notaPorNumero(d.cnpj, d.modelo, d.serie, d.numero);
    if (mesmoNumero) {
      return {
        cStat: 539,
        xMotivo: `Rejeição: Duplicidade de NF-e com diferença na Chave de Acesso [chNFe:${mesmoNumero.chave}][nRec:${mesmoNumero.nrec}]`,
      };
    }
    const ultimo = banco.ultimoNumero(d.cnpj, d.modelo, d.serie);
    if (d.numero > ultimo + 1) {
      return {
        cStat: 999,
        xMotivo: `${MOTIVOS[999]} (numeração fora de sequência: último número autorizado ${ultimo}, recebido ${d.numero})`,
      };
    }
    const ano = dhRecbto.slice(2, 4);
    const nProt = `1${String(ctx.config.cUF).padStart(2, "0")}${ano}${String(banco.proximaSequencia("nprot")).padStart(10, "0")}`;
    const protNFe = montarProtNFe(ctx, {
      chave: d.chave,
      dhRecbto,
      cStat: 100,
      xMotivo: MOTIVOS[100]!,
      nProt,
      digVal: d.digVal,
    });
    banco.inserirNota({
      chave: d.chave,
      cnpj: d.cnpj,
      modelo: d.modelo,
      serie: d.serie,
      numero: d.numero,
      nprot: nProt,
      nrec: nRec,
      dh_recbto: dhRecbto,
      dig_val: d.digVal,
      emitente: d.emitente,
      destinatario: d.destinatario,
      cpf_dest: d.cpfDest,
      valor: d.valor,
      dh_emi: d.dhEmi,
      xml_nfe: d.xmlNFe,
      prot_nfe: protNFe,
    });
    return { cStat: 100, xMotivo: MOTIVOS[100]!, protNFe, nProt };
  })();

  if (resultado.cStat !== 100) {
    banco.registrarRejeicao(d.chave, resultado.cStat, resultado.xMotivo);
    log.aviso("nfe.rejeitada", { chave: d.chave, cStat: resultado.cStat, xMotivo: resultado.xMotivo, nRec });
    return {
      protNFe: montarProtNFe(ctx, { chave: d.chave, dhRecbto, cStat: resultado.cStat, xMotivo: resultado.xMotivo }),
      cStat: resultado.cStat,
    };
  }
  log.info("nfe.autorizada", { chave: d.chave, nProt: resultado.nProt, numero: d.numero, serie: d.serie, nRec });
  return { protNFe: resultado.protNFe!, cStat: 100 };
}

function cabecalhoRetorno(ctx: Contexto, cStat: number, xMotivo: string, dhRecbto: string): string {
  return [
    el("tpAmb", ctx.config.tpAmb),
    el("verAplic", VER_APLIC),
    el("cStat", cStat),
    el("xMotivo", xMotivo),
    el("cUF", ctx.config.cUF),
    el("dhRecbto", dhRecbto),
  ].join("");
}

function novoRecibo(ctx: Contexto): string {
  return `${String(ctx.config.cUF).padStart(2, "0")}1${String(ctx.banco.proximaSequencia("nrec")).padStart(12, "0")}`;
}

/**
 * NFeAutorizacao4: recebe o enviNFe. Com `assincrono` (usado pelo modo caos),
 * só guarda o lote e devolve 103 com o recibo, como se a fila estivesse cheia.
 */
export function receberLote(conteudo: Element, ctx: Contexto, opcoes: { assincrono?: boolean } = {}): string {
  const dh = dataHora(agoraDe(ctx));
  const ret = (corpo: string) => el("retEnviNFe", [corpo], { xmlns: NS_NFE, versao: VERSAO });

  if (conteudo.localName !== "enviNFe" || conteudo.namespaceURI !== NS_NFE) {
    return ret(cabecalhoRetorno(ctx, 225, MOTIVOS[225]!, dh));
  }
  if (conteudo.getAttribute("versao") !== VERSAO) return ret(cabecalhoRetorno(ctx, 239, MOTIVOS[239]!, dh));
  const idLote = textoFilho(conteudo, "idLote");
  const indSinc = textoFilho(conteudo, "indSinc");
  const nfes = todos(conteudo, "NFe");
  if (!/^\d{1,15}$/.test(idLote) || !/^[01]$/.test(indSinc) || nfes.length === 0 || nfes.length > 50) {
    return ret(cabecalhoRetorno(ctx, 225, MOTIVOS[225]!, dh));
  }
  if (indSinc === "1" && nfes.length > 1) return ret(cabecalhoRetorno(ctx, 452, MOTIVOS[452]!, dh));

  const nRec = novoRecibo(ctx);
  if (indSinc === "0" || opcoes.assincrono) {
    ctx.banco.inserirLote({
      nrec: nRec,
      recebido_em: dh,
      pronto_em: agoraDe(ctx).getTime() + ctx.config.loteAssincronoMs,
      envi_nfe: serializar(conteudo),
      ret: null,
    });
    ctx.log.info("lote.recebido", { nRec, idLote, assincrono: true });
    return ret(
      cabecalhoRetorno(ctx, 103, MOTIVOS[103]!, dh) +
        el("infRec", [el("nRec", nRec), el("tMed", Math.max(1, Math.ceil(ctx.config.loteAssincronoMs / 1000)))]),
    );
  }

  const { protNFe } = processarNFe(nfes[0]!, nRec, ctx);
  return ret(cabecalhoRetorno(ctx, 104, MOTIVOS[104]!, dh) + protNFe);
}

/** NFeRetAutorizacao4: consulta o resultado de um lote pelo número do recibo. */
export function consultarRecibo(conteudo: Element, ctx: Contexto): string {
  const dh = dataHora(agoraDe(ctx));
  const nRec = textoFilho(conteudo, "nRec");
  const ret = (cStat: number, extra = "") =>
    el(
      "retConsReciNFe",
      [
        el("tpAmb", ctx.config.tpAmb),
        el("verAplic", VER_APLIC),
        el("nRec", nRec || "0"),
        el("cStat", cStat),
        el("xMotivo", MOTIVOS[cStat]!),
        el("cUF", ctx.config.cUF),
        el("dhRecbto", dh),
        extra,
      ],
      { xmlns: NS_NFE, versao: VERSAO },
    );
  if (conteudo.localName !== "consReciNFe") return ret(215);
  if (Number(textoFilho(conteudo, "tpAmb")) !== ctx.config.tpAmb) return ret(252);
  const lote = ctx.banco.lote(nRec);
  if (!lote) return ret(106);
  if (lote.ret) return ret(104, lote.ret);
  if (agoraDe(ctx).getTime() < lote.pronto_em) return ret(105);

  // Processa o lote agora (preguiçosamente) e guarda o resultado.
  const envi = parsear(lote.envi_nfe).documentElement;
  const prots = todos(envi, "NFe").map((nfe) => processarNFe(nfe, nRec, ctx).protNFe);
  ctx.banco.gravarRetornoLote(nRec, prots.join(""));
  return ret(104, prots.join(""));
}

/** NFeConsultaProtocolo4: situação atual da NF-e pela chave de acesso. */
export function consultarProtocolo(conteudo: Element, ctx: Contexto): string {
  const dh = dataHora(agoraDe(ctx));
  const chave = textoFilho(conteudo, "chNFe");
  const ret = (cStat: number, xMotivo = MOTIVOS[cStat]!, extra = "") =>
    el(
      "retConsSitNFe",
      [
        el("tpAmb", ctx.config.tpAmb),
        el("verAplic", VER_APLIC),
        el("cStat", cStat),
        el("xMotivo", xMotivo),
        el("cUF", ctx.config.cUF),
        el("dhRecbto", dh),
        el("chNFe", chave || "0"),
        extra,
      ],
      { xmlns: NS_NFE, versao: VERSAO },
    );
  if (conteudo.localName !== "consSitNFe" || textoFilho(conteudo, "xServ") !== "CONSULTAR") return ret(215);
  if (Number(textoFilho(conteudo, "tpAmb")) !== ctx.config.tpAmb) return ret(252);
  if (!/^\d{44}$/.test(chave) || !chaveValida(chave)) return ret(236);
  if (chave.slice(0, 2) !== String(ctx.config.cUF)) return ret(226);
  const nota = ctx.banco.notaPorChave(chave);
  if (!nota) return ret(217);
  return ret(100, MOTIVOS[100], nota.prot_nfe);
}
