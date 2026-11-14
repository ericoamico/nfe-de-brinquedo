import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/** Escapa texto para conteúdo de elemento / atributo XML. */
export function escapar(texto: string | number): string {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Filho = string | number | null | undefined | false | Filho[];

function juntar(filhos: Filho[]): string {
  let s = "";
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) s += juntar(f);
    else s += String(f);
  }
  return s;
}

/**
 * Monta um elemento XML compacto (sem espaços nem quebras entre as tags).
 * - `el("cUF", 99)` -> `<cUF>99</cUF>` (texto é escapado)
 * - `el("ide", [el(...), el(...)])` -> filhos já montados, concatenados
 * - `el("NFe", [...], { xmlns: "..." })`
 * Valores `null`/`undefined` omitem o elemento (grupos opcionais).
 */
export function el(
  nome: string,
  conteudo: string | number | Filho[] | null | undefined,
  atributos?: Record<string, string | number | undefined>,
): string {
  if (conteudo === null || conteudo === undefined) return "";
  const attrs = atributos
    ? Object.entries(atributos)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${escapar(v as string)}"`)
        .join("")
    : "";
  const corpo = Array.isArray(conteudo) ? juntar(conteudo) : escapar(conteudo);
  return `<${nome}${attrs}>${corpo}</${nome}>`;
}

/** Remove espaços em branco entre tags (para XML recebido de fora). */
export function compactar(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

export function parsear(xml: string): Document {
  const erros: string[] = [];
  const doc = new DOMParser({
    onError: (nivel: string, msg: string) => {
      if (nivel !== "warning") erros.push(msg);
    },
  }).parseFromString(xml, "text/xml");
  if (erros.length || !doc || !doc.documentElement) {
    throw new ErroXml(erros[0] ?? "XML mal formado");
  }
  return doc as unknown as Document;
}

export class ErroXml extends Error {}

export function serializar(no: Node): string {
  return new XMLSerializer().serializeToString(no as any);
}

/** Primeiro elemento descendente com o nome local informado (ignora namespace). */
export function primeiro(raiz: Node | null | undefined, nomeLocal: string): Element | null {
  if (!raiz) return null;
  const lista = (raiz as Element).getElementsByTagNameNS
    ? (raiz as Element).getElementsByTagNameNS("*", nomeLocal)
    : (raiz as Document).getElementsByTagNameNS("*", nomeLocal);
  return (lista[0] as Element) ?? null;
}

export function todos(raiz: Node, nomeLocal: string): Element[] {
  return Array.from((raiz as Element).getElementsByTagNameNS("*", nomeLocal)) as Element[];
}

/** Texto do primeiro descendente com o nome local informado, ou "" se não houver. */
export function texto(raiz: Node | null | undefined, nomeLocal: string): string {
  return primeiro(raiz, nomeLocal)?.textContent?.trim() ?? "";
}

/** Filho direto (não neto) com o nome local informado. */
export function filho(raiz: Element | null | undefined, nomeLocal: string): Element | null {
  if (!raiz) return null;
  for (let n = raiz.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === nomeLocal) return n as Element;
  }
  return null;
}

export function textoFilho(raiz: Element | null | undefined, nomeLocal: string): string {
  return filho(raiz, nomeLocal)?.textContent?.trim() ?? "";
}
