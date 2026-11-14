import { montarChave } from "../../../comum/chave";
import { soDigitos } from "../../../comum/documentos";
import { NS_NFE, VERSAO } from "../../../comum/soap";
import { el } from "../../../comum/xml";

/** Valores monetários sempre em centavos (inteiros) para não errar arredondamento. */
export type Centavos = number;

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigoMunicipio: string; // 7 dígitos
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
}

export interface Emitente {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  ie: string;
  crt: 1 | 2 | 3;
  endereco: Endereco;
  cUF: number;
}

export interface Destinatario {
  nome: string;
  cpf: string;
  email: string;
  endereco: Endereco;
}

export interface ItemNota {
  codigo: string;
  descricao: string;
  ncm: string;
  quantidade: number;
  valorUnitario: Centavos;
}

export type FormaPagamento = "pix" | "boleto" | "cartao";

export interface DadosNota {
  emitente: Emitente;
  destinatario: Destinatario;
  itens: ItemNota[];
  frete: Centavos;
  pagamento: FormaPagamento;
  serie: number;
  numero: number;
  cNF: string;
  emissao: Date;
  tpAmb: 1 | 2;
  pedido: string;
}

export interface NotaMontada {
  chave: string;
  xml: string; // <NFe> sem assinatura
  totais: { produtos: Centavos; frete: Centavos; nota: Centavos };
}

const TPAG: Record<FormaPagamento, string> = { cartao: "03", boleto: "15", pix: "17" };

export const dinheiro = (c: Centavos) => (c / 100).toFixed(2);
const quantidade = (q: number) => q.toFixed(4);

/** Data/hora no formato do leiaute (AAAA-MM-DDThh:mm:ss-03:00), horário de Brasília. */
export function dataHoraBrasilia(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().slice(0, 19) + "-03:00";
}

/** Divide o frete entre os itens proporcionalmente ao valor; o último item leva a sobra do arredondamento. */
export function ratearFrete(itens: { vProd: Centavos }[], frete: Centavos): Centavos[] {
  const total = itens.reduce((s, i) => s + i.vProd, 0);
  if (frete === 0 || total === 0) return itens.map(() => 0);
  const partes = itens.map((i) => Math.floor((frete * i.vProd) / total));
  const resto = frete - partes.reduce((s, p) => s + p, 0);
  partes[partes.length - 1]! += resto;
  return partes;
}

function endereco(nome: string, e: Endereco): string {
  return el(nome, [
    el("xLgr", e.logradouro),
    el("nro", e.numero),
    e.complemento ? el("xCpl", e.complemento) : "",
    el("xBairro", e.bairro),
    el("cMun", e.codigoMunicipio),
    el("xMun", e.municipio),
    el("UF", e.uf),
    el("CEP", soDigitos(e.cep)),
    el("cPais", 1058),
    el("xPais", "Brasil"),
    e.telefone ? el("fone", soDigitos(e.telefone)) : "",
  ]);
}

/**
 * Monta o XML da NF-e modelo 55, versão 4.00, de uma venda pela internet para
 * consumidor final (indPres=2, sem intermediador: indIntermed=0).
 * O XML sai compacto (sem espaços nem quebras entre as tags).
 */
export function montarNFe(d: DadosNota): NotaMontada {
  const { emitente: emit, destinatario: dest } = d;
  const aamm = dataHoraBrasilia(d.emissao).slice(2, 7).replace("-", "");
  const chave = montarChave({
    cUF: emit.cUF,
    aamm,
    cnpj: emit.cnpj,
    modelo: 55,
    serie: d.serie,
    numero: d.numero,
    tpEmis: 1,
    cNF: d.cNF,
  });

  const mesmaUF = dest.endereco.uf === emit.endereco.uf;
  const cfop = mesmaUF ? "5102" : "6102";
  const linhas = d.itens.map((i) => ({ ...i, vProd: Math.round(i.quantidade * i.valorUnitario) }));
  const fretes = ratearFrete(linhas, d.frete);
  const vProd = linhas.reduce((s, i) => s + i.vProd, 0);
  const vNF = vProd + d.frete;

  const ide = el("ide", [
    el("cUF", emit.cUF),
    el("cNF", d.cNF),
    el("natOp", "Venda de mercadoria"),
    el("mod", 55),
    el("serie", d.serie),
    el("nNF", d.numero),
    el("dhEmi", dataHoraBrasilia(d.emissao)),
    el("tpNF", 1),
    el("idDest", mesmaUF ? 1 : 2),
    el("cMunFG", emit.endereco.codigoMunicipio),
    el("tpImp", 1),
    el("tpEmis", 1),
    el("cDV", chave.slice(-1)),
    el("tpAmb", d.tpAmb),
    el("finNFe", 1),
    el("indFinal", 1),
    el("indPres", 2),
    el("indIntermed", 0),
    el("procEmi", 0),
    el("verProc", "LojaBrinquedo-1.0"),
  ]);

  const emitXml = el("emit", [
    el("CNPJ", emit.cnpj),
    el("xNome", emit.razaoSocial),
    el("xFant", emit.nomeFantasia),
    endereco("enderEmit", emit.endereco),
    el("IE", emit.ie),
    el("CRT", emit.crt),
  ]);

  const destXml = el("dest", [
    el("CPF", soDigitos(dest.cpf)),
    el("xNome", dest.nome),
    endereco("enderDest", dest.endereco),
    el("indIEDest", 9),
    el("email", dest.email),
  ]);

  const dets = linhas.map((i, n) =>
    el(
      "det",
      [
        el("prod", [
          el("cProd", i.codigo),
          el("cEAN", "SEM GTIN"),
          el("xProd", i.descricao),
          el("NCM", i.ncm),
          el("CFOP", cfop),
          el("uCom", "UN"),
          el("qCom", quantidade(i.quantidade)),
          el("vUnCom", dinheiro(i.valorUnitario)),
          el("vProd", dinheiro(i.vProd)),
          el("cEANTrib", "SEM GTIN"),
          el("uTrib", "UN"),
          el("qTrib", quantidade(i.quantidade)),
          el("vUnTrib", dinheiro(i.valorUnitario)),
          fretes[n] ? el("vFrete", dinheiro(fretes[n]!)) : "",
          el("indTot", 1),
        ]),
        el("imposto", [
          el("ICMS", [el("ICMSSN102", [el("orig", 0), el("CSOSN", 102)])]),
          el("PIS", [el("PISNT", [el("CST", "07")])]),
          el("COFINS", [el("COFINSNT", [el("CST", "07")])]),
        ]),
      ],
      { nItem: n + 1 },
    ),
  );

  const zero = dinheiro(0);
  const total = el("total", [
    el("ICMSTot", [
      el("vBC", zero),
      el("vICMS", zero),
      el("vICMSDeson", zero),
      el("vFCP", zero),
      el("vBCST", zero),
      el("vST", zero),
      el("vFCPST", zero),
      el("vFCPSTRet", zero),
      el("vProd", dinheiro(vProd)),
      el("vFrete", dinheiro(d.frete)),
      el("vSeg", zero),
      el("vDesc", zero),
      el("vII", zero),
      el("vIPI", zero),
      el("vIPIDevol", zero),
      el("vPIS", zero),
      el("vCOFINS", zero),
      el("vOutro", zero),
      el("vNF", dinheiro(vNF)),
    ]),
  ]);

  const transp = el("transp", [el("modFrete", 0)]);
  const tPag = TPAG[d.pagamento];
  const pag = el("pag", [
    el("detPag", [
      el("indPag", 0),
      el("tPag", tPag),
      el("vPag", dinheiro(vNF)),
      d.pagamento === "cartao" ? el("card", [el("tpIntegra", 2)]) : "",
    ]),
  ]);
  const infAdic = el("infAdic", [
    el("infCpl", `DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL. Pedido ${d.pedido}. Venda realizada pela internet.`),
  ]);

  const infNFe = el("infNFe", [ide, emitXml, destXml, ...dets, total, transp, pag, infAdic], {
    versao: VERSAO,
    Id: `NFe${chave}`,
  });
  return {
    chave,
    xml: el("NFe", [infNFe], { xmlns: NS_NFE }),
    totais: { produtos: vProd, frete: d.frete, nota: vNF },
  };
}

/** Lote de envio síncrono (indSinc=1) com uma única NF-e já assinada. */
export function montarEnviNFe(nfeAssinada: string, idLote: string): string {
  return el("enviNFe", [el("idLote", idLote), el("indSinc", 1), nfeAssinada], {
    xmlns: NS_NFE,
    versao: VERSAO,
  });
}

export function montarConsSitNFe(chave: string, tpAmb: number): string {
  return el("consSitNFe", [el("tpAmb", tpAmb), el("xServ", "CONSULTAR"), el("chNFe", chave)], {
    xmlns: NS_NFE,
    versao: VERSAO,
  });
}

export function montarConsReciNFe(nRec: string, tpAmb: number): string {
  return el("consReciNFe", [el("tpAmb", tpAmb), el("nRec", nRec)], { xmlns: NS_NFE, versao: VERSAO });
}

/** nfeProc = NF-e assinada + protocolo de autorização. */
export function montarNfeProc(nfeAssinada: string, protNFe: string): string {
  const semDeclaracao = (s: string) => s.replace(/^<\?xml[^>]*\?>/, "");
  return el("nfeProc", [semDeclaracao(nfeAssinada), semDeclaracao(protNFe)], { xmlns: NS_NFE, versao: VERSAO });
}
