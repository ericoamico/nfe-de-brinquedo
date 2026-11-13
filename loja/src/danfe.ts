import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { formatarChave } from "../../comum/chave";
import { formatarCEP, formatarCNPJ, formatarCPF } from "../../comum/documentos";
import { filho, parsear, primeiro, texto, textoFilho, todos } from "../../comum/xml";

/**
 * DANFE (Documento Auxiliar da NF-e) em PDF, no layout tradicional em retrato.
 * O PDF é "tagged" (estruturado): títulos, campos e a tabela de produtos ficam
 * numa ordem de leitura lógica para leitores de tela. Linhas e a marca d'água
 * são marcadas como artefatos (o leitor ignora).
 */

const AVISO = "DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL";
const TPAG: Record<string, string> = {
  "01": "Dinheiro", "03": "Cartão de crédito", "04": "Cartão de débito", "15": "Boleto bancário", "17": "Pix",
};
const MOD_FRETE: Record<string, string> = {
  "0": "0 - Remetente (CIF)", "1": "1 - Destinatário (FOB)", "2": "2 - Terceiros", "9": "9 - Sem frete",
};

const numeroBR = (v: string, casas = 2) =>
  v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const data = (dh: string) => (dh ? `${dh.slice(8, 10)}/${dh.slice(5, 7)}/${dh.slice(0, 4)}` : "");
const hora = (dh: string) => dh.slice(11, 19);
const numeroNota = (n: string) => n.padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");

export interface OpcoesDanfe {
  /** Página pública de consulta (destino do QR Code). */
  urlConsulta: string;
}

export async function gerarDanfe(xmlProc: string, opcoes: OpcoesDanfe): Promise<Uint8Array> {
  const doc0 = parsear(xmlProc);
  const inf = primeiro(doc0, "infNFe")!;
  const ide = filho(inf, "ide")!;
  const emit = filho(inf, "emit")!;
  const enderEmit = filho(emit, "enderEmit")!;
  const dest = filho(inf, "dest")!;
  const enderDest = filho(dest, "enderDest")!;
  const tot = primeiro(filho(inf, "total"), "ICMSTot")!;
  const prot = primeiro(doc0, "infProt");
  const chave = (inf.getAttribute("Id") ?? "").replace(/^NFe/, "");
  const nNF = textoFilho(ide, "nNF");
  const serie = textoFilho(ide, "serie").padStart(3, "0");
  const dhEmi = textoFilho(ide, "dhEmi");
  const urlQr = `${opcoes.urlConsulta}?chave=${chave}`;

  const [codigoBarras, qr] = await Promise.all([
    bwipjs.toBuffer({ bcid: "code128", text: chave, scale: 2, height: 9, includetext: false }),
    bwipjs.toBuffer({ bcid: "qrcode", text: urlQr, scale: 4 }),
  ]);

  const doc = new PDFDocument({
    size: "A4",
    margin: 18,
    tagged: true,
    lang: "pt-BR",
    displayTitle: true,
    pdfVersion: "1.7",
    info: {
      Title: `Nota fiscal nº ${Number(nNF)} - Loja do Érico (fictícia) - ${AVISO}`,
      Author: "Loja do Érico (fictícia)",
      Subject: "DANFE de brinquedo, sem valor fiscal",
      Keywords: "DANFE, nota fiscal de brinquedo, sem valor fiscal",
    },
  });
  const pedacos: Buffer[] = [];
  doc.on("data", (b: Buffer) => pedacos.push(b));
  const fim = new Promise<Uint8Array>((ok) => doc.on("end", () => ok(Buffer.concat(pedacos))));

  const raiz = doc.struct("Document");
  doc.addStructure(raiz);

  const artefato = (desenhar: () => void) => {
    doc.markContent("Artifact", { type: "Layout" } as any);
    desenhar();
    doc.endMarkedContent();
  };
  const marcado = (tipo: string, pai: PDFKit.PDFStructureElement, desenhar: () => void, opts?: object) => {
    const el = doc.struct(tipo, opts as any);
    pai.add(el);
    const conteudo = doc.markStructureContent(tipo, opts as any);
    desenhar();
    doc.endMarkedContent();
    el.add(conteudo);
    el.end();
    return el;
  };
  const caixa = (x: number, y: number, w: number, h: number) =>
    artefato(() => doc.lineWidth(0.6).strokeColor("#000").roundedRect(x, y, w, h, 2).stroke());

  /** Campo do DANFE: rótulo pequeno em cima, valor embaixo. */
  const campo = (
    pai: PDFKit.PDFStructureElement,
    x: number, y: number, w: number, h: number,
    rotulo: string, valor: string,
    o: { alinhar?: "left" | "right" | "center"; tamanho?: number; negrito?: boolean } = {},
  ) => {
    caixa(x, y, w, h);
    marcado("P", pai, () => {
      doc.font("Helvetica").fontSize(5.5).fillColor("#000").text(`${rotulo} `, x + 2.5, y + 2, { width: w - 5, lineBreak: false });
      doc
        .font(o.negrito === false ? "Helvetica" : "Helvetica-Bold")
        .fontSize(o.tamanho ?? 8)
        .text(valor || " ", x + 2.5, y + 9.5, { width: w - 5, align: o.alinhar ?? "left", height: h - 10, ellipsis: true });
    });
  };
  const secao = (y: number, titulo: string) => {
    const s = doc.struct("Sect");
    raiz.add(s);
    marcado("H2", s, () => doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#000").text(titulo, 18, y, { lineBreak: false }));
    return s;
  };

  const X = 18;
  const W = 559;

  // Marca d'água (artefato, atrás de tudo).
  artefato(() => {
    doc.save();
    doc.rotate(-35, { origin: [297, 420] });
    doc.font("Helvetica-Bold").fontSize(58).fillColor("#000").fillOpacity(0.07);
    doc.text("SEM VALOR FISCAL", 0, 390, { width: 595, align: "center", lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
  });

  // Aviso em destaque (é o primeiro título do documento).
  artefato(() => doc.lineWidth(2).strokeColor("#b00020").rect(X, 18, W, 26).stroke().strokeColor("#000"));
  marcado("H1", raiz, () =>
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#b00020").text(AVISO, X, 24.5, { width: W, align: "center", lineBreak: false }),
  );
  doc.fillColor("#000");

  // Canhoto.
  const canhoto = doc.struct("Sect");
  raiz.add(canhoto);
  const razao = textoFilho(emit, "xNome");
  campo(
    canhoto, X, 50, W - 110, 26, "CANHOTO",
    `RECEBEMOS DE ${razao} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO. EMISSÃO: ${data(dhEmi)}  VALOR TOTAL: R$ ${numeroBR(textoFilho(tot, "vNF"))}`,
    { tamanho: 6, negrito: false },
  );
  campo(canhoto, X, 76, 110, 20, "DATA DE RECEBIMENTO", "");
  campo(canhoto, X + 110, 76, W - 220, 20, "IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", "");
  campo(canhoto, X + W - 110, 50, 110, 46, "NF-e", `Nº ${numeroNota(nNF)}\nSÉRIE ${serie}`, { alinhar: "center", tamanho: 9 });
  artefato(() => doc.lineWidth(0.5).dash(3, { space: 2 }).moveTo(X, 101).lineTo(X + W, 101).stroke().undash());

  // Cabeçalho: emitente, DANFE, chave + QR Code.
  const cab = doc.struct("Sect");
  raiz.add(cab);
  const yC = 105;
  caixa(X, yC, 230, 120);
  marcado("P", cab, () => {
    doc.font("Helvetica").fontSize(5.5).text("IDENTIFICAÇÃO DO EMITENTE ", X + 3, yC + 3, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10).text(textoFilho(emit, "xFant") || razao, X + 6, yC + 18, { width: 218 });
    doc.font("Helvetica").fontSize(7.5);
    const linhas = [
      razao,
      `${textoFilho(enderEmit, "xLgr")}, ${textoFilho(enderEmit, "nro")}${textoFilho(enderEmit, "xCpl") ? " - " + textoFilho(enderEmit, "xCpl") : ""}`,
      `${textoFilho(enderEmit, "xBairro")} - ${textoFilho(enderEmit, "xMun")}`,
      `CEP ${formatarCEP(textoFilho(enderEmit, "CEP"))}${textoFilho(enderEmit, "fone") ? "  Fone " + textoFilho(enderEmit, "fone") : ""}`,
    ];
    doc.text(linhas.join("\n"), X + 6, yC + 50, { width: 218, lineGap: 1.5 });
  });

  const xD = X + 230;
  caixa(xD, yC, 100, 120);
  marcado("P", cab, () => {
    doc.font("Helvetica-Bold").fontSize(14).text("DANFE ", xD, yC + 6, { width: 100, align: "center" });
    doc.font("Helvetica").fontSize(6.5).text("DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA ", xD + 6, yC + 24, { width: 88, align: "center" });
    doc.fontSize(7).text("0 - ENTRADA\n1 - SAÍDA ", xD + 10, yC + 48, { lineGap: 1 });
    doc.font("Helvetica-Bold").fontSize(11).text(textoFilho(ide, "tpNF"), xD + 72, yC + 52, { width: 16, align: "center" });
    doc.font("Helvetica-Bold").fontSize(8.5).text(`Nº ${numeroNota(nNF)}\nSÉRIE ${serie}\nFOLHA 1/1`, xD, yC + 78, {
      width: 100, align: "center", lineGap: 1.5,
    });
  });
  artefato(() => doc.lineWidth(0.6).rect(xD + 70, yC + 50, 20, 16).stroke());

  const xK = xD + 100;
  const wK = W - 330;
  caixa(xK, yC, wK, 120);
  marcado(
    "Figure",
    cab,
    () => doc.image(codigoBarras, xK + 6, yC + 4, { width: wK - 12, height: 28 }),
    { alt: "Código de barras da chave de acesso" },
  );
  campo(cab, xK, yC + 36, wK, 20, "CHAVE DE ACESSO", formatarChave(chave), { alinhar: "center", tamanho: 7.5 });
  marcado("P", cab, () => {
    doc.font("Helvetica").fontSize(6.5).text(
      "Consulta de autenticidade no site da Receita de Brinquedo, pelo QR Code ao lado ou pelo endereço:",
      xK + 4, yC + 61, { width: wK - 70 },
    );
    doc.font("Helvetica-Bold").fontSize(6).text(opcoes.urlConsulta, xK + 4, yC + 88, { width: wK - 70 });
  });
  marcado("Figure", cab, () => doc.image(qr, xK + wK - 62, yC + 58, { width: 58, height: 58 }), {
    alt: "QR Code para consultar esta nota no site da Receita de Brinquedo",
  });

  // Natureza / protocolo / inscrições.
  const ident = doc.struct("Sect");
  raiz.add(ident);
  campo(ident, X, 228, 330, 20, "NATUREZA DA OPERAÇÃO", textoFilho(ide, "natOp"));
  const protTexto = prot ? `${textoFilho(prot, "nProt")} - ${data(textoFilho(prot, "dhRecbto"))} ${hora(textoFilho(prot, "dhRecbto"))}` : "";
  campo(ident, X + 330, 228, W - 330, 20, "PROTOCOLO DE AUTORIZAÇÃO DE USO", protTexto, { alinhar: "center" });
  campo(ident, X, 248, 186, 20, "INSCRIÇÃO ESTADUAL", textoFilho(emit, "IE"));
  campo(ident, X + 186, 248, 186, 20, "INSCRIÇÃO ESTADUAL DO SUBST. TRIBUTÁRIO", "");
  campo(ident, X + 372, 248, W - 372, 20, "CNPJ", formatarCNPJ(textoFilho(emit, "CNPJ")));

  // Destinatário.
  const sd = secao(274, "DESTINATÁRIO / REMETENTE");
  const docDest = textoFilho(dest, "CPF") ? formatarCPF(textoFilho(dest, "CPF")) : formatarCNPJ(textoFilho(dest, "CNPJ"));
  campo(sd, X, 283, 330, 20, "NOME / RAZÃO SOCIAL", textoFilho(dest, "xNome"));
  campo(sd, X + 330, 283, 130, 20, "CNPJ / CPF", docDest);
  campo(sd, X + 460, 283, W - 460, 20, "DATA DA EMISSÃO", data(dhEmi), { alinhar: "center" });
  const endDest = `${textoFilho(enderDest, "xLgr")}, ${textoFilho(enderDest, "nro")}${textoFilho(enderDest, "xCpl") ? " - " + textoFilho(enderDest, "xCpl") : ""}`;
  campo(sd, X, 303, 260, 20, "ENDEREÇO", endDest);
  campo(sd, X + 260, 303, 140, 20, "BAIRRO / DISTRITO", textoFilho(enderDest, "xBairro"));
  campo(sd, X + 400, 303, 60, 20, "CEP", formatarCEP(textoFilho(enderDest, "CEP")));
  campo(sd, X + 460, 303, W - 460, 20, "DATA DA SAÍDA", data(dhEmi), { alinhar: "center" });
  campo(sd, X, 323, 200, 20, "MUNICÍPIO", textoFilho(enderDest, "xMun"));
  campo(sd, X + 200, 323, 110, 20, "FONE / FAX", textoFilho(enderDest, "fone"));
  campo(sd, X + 310, 323, 40, 20, "UF", textoFilho(enderDest, "UF"), { alinhar: "center" });
  campo(sd, X + 350, 323, 110, 20, "INSCRIÇÃO ESTADUAL", "");
  campo(sd, X + 460, 323, W - 460, 20, "HORA DA SAÍDA", hora(dhEmi), { alinhar: "center" });

  // Pagamento.
  const sp = secao(349, "PAGAMENTO");
  const pags = todos(filho(inf, "pag") ?? inf, "detPag");
  const larguraPag = W / Math.max(pags.length, 1);
  pags.forEach((p, i) =>
    campo(sp, X + i * larguraPag, 358, larguraPag, 20, "FORMA DE PAGAMENTO E VALOR",
      `${TPAG[textoFilho(p, "tPag")] ?? textoFilho(p, "tPag")}: R$ ${numeroBR(textoFilho(p, "vPag"))}`),
  );

  // Cálculo do imposto.
  const si = secao(384, "CÁLCULO DO IMPOSTO");
  const linha1: [string, string][] = [
    ["BASE DE CÁLCULO DO ICMS", "vBC"], ["VALOR DO ICMS", "vICMS"], ["BASE DE CÁLC. ICMS S.T.", "vBCST"],
    ["VALOR DO ICMS SUBST.", "vST"], ["VALOR TOTAL DOS PRODUTOS", "vProd"],
  ];
  linha1.forEach(([r, t], i) => campo(si, X + i * (W / 5), 393, W / 5, 20, r, numeroBR(textoFilho(tot, t)), { alinhar: "right" }));
  const linha2: [string, string][] = [
    ["VALOR DO FRETE", "vFrete"], ["VALOR DO SEGURO", "vSeg"], ["DESCONTO", "vDesc"],
    ["OUTRAS DESPESAS", "vOutro"], ["VALOR TOTAL DO IPI", "vIPI"], ["VALOR TOTAL DA NOTA", "vNF"],
  ];
  linha2.forEach(([r, t], i) => campo(si, X + i * (W / 6), 413, W / 6, 20, r, numeroBR(textoFilho(tot, t)), { alinhar: "right" }));

  // Transportador.
  const st = secao(439, "TRANSPORTADOR / VOLUMES TRANSPORTADOS");
  const transp = filho(inf, "transp");
  campo(st, X, 448, 260, 20, "RAZÃO SOCIAL", textoFilho(filho(transp, "transporta"), "xNome") || "Entrega própria");
  campo(st, X + 260, 448, 150, 20, "FRETE POR CONTA", MOD_FRETE[textoFilho(transp, "modFrete")] ?? "");
  campo(st, X + 410, 448, W - 410, 20, "QUANTIDADE DE VOLUMES", "1");

  // Produtos (tabela estruturada).
  const sprod = secao(474, "DADOS DOS PRODUTOS / SERVIÇOS");
  const colunas: { r: string; w: number; a: "left" | "right" | "center" }[] = [
    { r: "CÓDIGO", w: 50, a: "left" }, { r: "DESCRIÇÃO DO PRODUTO / SERVIÇO", w: 165, a: "left" },
    { r: "NCM/SH", w: 42, a: "center" }, { r: "CSOSN", w: 30, a: "center" }, { r: "CFOP", w: 28, a: "center" },
    { r: "UN", w: 20, a: "center" }, { r: "QUANT.", w: 38, a: "right" }, { r: "VALOR UNIT.", w: 50, a: "right" },
    { r: "VALOR TOTAL", w: 50, a: "right" }, { r: "B.CÁLC ICMS", w: 30, a: "right" }, { r: "VALOR ICMS", w: 28, a: "right" },
    { r: "ALÍQ. ICMS", w: 28, a: "right" },
  ];
  const tabela = doc.struct("Table");
  sprod.add(tabela);
  const linhaTabela = (y: number, h: number, valores: string[], cabecalho: boolean) => {
    const tr = doc.struct("TR");
    tabela.add(tr);
    let x = X;
    colunas.forEach((c, i) => {
      artefato(() => doc.lineWidth(0.5).rect(x, y, c.w, h).stroke());
      const tipo = cabecalho ? "TH" : "TD";
      const xi = x;
      marcado(tipo, tr, () =>
        doc
          .font(cabecalho ? "Helvetica-Bold" : "Helvetica")
          .fontSize(cabecalho ? 5.2 : 6.5)
          .text(`${valores[i] ?? ""} `, xi + 1.5, y + (cabecalho ? 2.5 : 3), {
            width: c.w - 3, align: c.a, height: h - 3, ellipsis: true,
          }),
      );
      x += c.w;
    });
    tr.end();
  };
  linhaTabela(483, 16, colunas.map((c) => c.r), true);
  let y = 499;
  for (const det of todos(inf, "det")) {
    const prod = filho(det, "prod");
    const csosn = texto(filho(det, "imposto"), "CSOSN") || texto(filho(det, "imposto"), "CST");
    linhaTabela(y, 22, [
      textoFilho(prod, "cProd"), textoFilho(prod, "xProd"), textoFilho(prod, "NCM"), csosn, textoFilho(prod, "CFOP"),
      textoFilho(prod, "uCom"), numeroBR(textoFilho(prod, "qCom"), 4), numeroBR(textoFilho(prod, "vUnCom")),
      numeroBR(textoFilho(prod, "vProd")), "0,00", "0,00", "0,00",
    ], false);
    y += 22;
    if (y > 700) break; // o carrinho da loja tem no máximo 8 produtos diferentes: sempre cabe em uma folha
  }
  tabela.end();

  // Dados adicionais.
  const sa = secao(722, "DADOS ADICIONAIS");
  const infCpl = texto(filho(inf, "infAdic"), "infCpl");
  campo(sa, X, 731, 370, 72, "INFORMAÇÕES COMPLEMENTARES",
    `${infCpl}\nDocumento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.`,
    { tamanho: 7, negrito: false });
  campo(sa, X + 370, 731, W - 370, 72, "RESERVADO AO FISCO", AVISO, { tamanho: 8, alinhar: "center" });

  marcado("P", raiz, () =>
    doc.font("Helvetica").fontSize(6.5).fillColor("#444").text(
      "Nota fiscal de brinquedo emitida pela Loja do Érico (fictícia) e autorizada pela Receita de Brinquedo, para estudo. Não tem valor fiscal.",
      X, 810, { width: W, align: "center" },
    ),
  );

  raiz.end();
  doc.end();
  return fim;
}
