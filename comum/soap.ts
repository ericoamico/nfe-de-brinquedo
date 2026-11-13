import { compactar, ErroXml, parsear, primeiro, serializar } from "./xml";

export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
export const NS_SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
export const VERSAO = "4.00";
export const VER_APLIC = "BRINQUEDO-1.0";

/** Os três serviços simulados, com o namespace WSDL e a operação SOAP de cada um. */
export const SERVICOS = {
  autorizacao: {
    caminho: "/ws/NFeAutorizacao4.asmx",
    ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4",
    operacao: "nfeAutorizacaoLote",
  },
  retAutorizacao: {
    caminho: "/ws/NFeRetAutorizacao4.asmx",
    ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4",
    operacao: "nfeRetAutorizacaoLote",
  },
  consultaProtocolo: {
    caminho: "/ws/NFeConsultaProtocolo4.asmx",
    ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4",
    operacao: "nfeConsultaNF",
  },
} as const;

export type NomeServico = keyof typeof SERVICOS;

export function contentTypeSoap(servico: NomeServico): string {
  const s = SERVICOS[servico];
  return `application/soap+xml; charset=utf-8; action="${s.ns}/${s.operacao}"`;
}

/** Envelope SOAP 1.2 com a mensagem dentro de nfeDadosMsg (requisição). */
export function envelopeRequisicao(servico: NomeServico, mensagem: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${NS_SOAP12}"><soap12:Body>` +
    `<nfeDadosMsg xmlns="${SERVICOS[servico].ns}">${mensagem}</nfeDadosMsg>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

/** Envelope SOAP 1.2 com o retorno dentro de nfeResultMsg (resposta). */
export function envelopeResposta(servico: NomeServico, mensagem: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${NS_SOAP12}"><soap12:Body>` +
    `<nfeResultMsg xmlns="${SERVICOS[servico].ns}">${mensagem}</nfeResultMsg>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

export function envelopeFalha(motivo: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${NS_SOAP12}"><soap12:Body><soap12:Fault>` +
    `<soap12:Code><soap12:Value>soap12:Sender</soap12:Value></soap12:Code>` +
    `<soap12:Reason><soap12:Text xml:lang="pt-BR">${motivo}</soap12:Text></soap12:Reason>` +
    `</soap12:Fault></soap12:Body></soap12:Envelope>`
  );
}

/**
 * Abre um envelope SOAP 1.2 e devolve o XML do primeiro elemento dentro de
 * nfeDadosMsg/nfeResultMsg. Lança ErroXml se o envelope não estiver no padrão.
 */
export function abrirEnvelope(
  xml: string,
  esperado: { servico: NomeServico; dentroDe: "nfeDadosMsg" | "nfeResultMsg" },
): { conteudo: string; elemento: Element } {
  const doc = parsear(compactar(xml));
  const raiz = doc.documentElement;
  if (raiz.localName !== "Envelope" || raiz.namespaceURI !== NS_SOAP12) {
    throw new ErroXml("não é um envelope SOAP 1.2");
  }
  const body = primeiro(raiz, "Body");
  if (!body || body.namespaceURI !== NS_SOAP12) throw new ErroXml("envelope sem Body");
  const msg = primeiro(body, esperado.dentroDe);
  if (!msg || msg.namespaceURI !== SERVICOS[esperado.servico].ns) {
    throw new ErroXml(`${esperado.dentroDe} ausente ou com namespace errado`);
  }
  let interno: Element | null = null;
  for (let n = msg.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1) {
      interno = n as Element;
      break;
    }
  }
  if (!interno) throw new ErroXml(`${esperado.dentroDe} vazio`);
  return { conteudo: serializar(interno), elemento: interno };
}
