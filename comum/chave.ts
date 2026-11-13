/**
 * Chave de acesso da NF-e (44 dígitos):
 *   cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 */
export interface PartesChave {
  cUF: string | number;
  aamm: string; // ano e mês da emissão, "AAMM"
  cnpj: string;
  modelo: string | number;
  serie: string | number;
  numero: string | number;
  tpEmis: string | number;
  cNF: string | number;
}

const pad = (v: string | number, n: number) => String(v).padStart(n, "0");

/** Dígito verificador módulo 11, pesos 2 a 9 da direita para a esquerda. Resto 0 ou 1 -> DV 0. */
export function calcularDV(chave43: string): number {
  if (!/^\d{43}$/.test(chave43)) throw new Error("a base da chave precisa ter 43 dígitos");
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function montarChave(p: PartesChave): string {
  const base =
    pad(p.cUF, 2) +
    p.aamm +
    pad(p.cnpj, 14) +
    pad(p.modelo, 2) +
    pad(p.serie, 3) +
    pad(p.numero, 9) +
    pad(p.tpEmis, 1) +
    pad(p.cNF, 8);
  return base + calcularDV(base);
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && calcularDV(chave.slice(0, 43)) === Number(chave[43]);
}

export function desmontarChave(chave: string) {
  return {
    cUF: chave.slice(0, 2),
    aamm: chave.slice(2, 6),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: chave.slice(22, 25),
    numero: chave.slice(25, 34),
    tpEmis: chave.slice(34, 35),
    cNF: chave.slice(35, 43),
    cDV: chave.slice(43, 44),
  };
}

/** Formata em blocos de 4 dígitos, como impresso no DANFE. */
export function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * Gera o código numérico (cNF) de 8 dígitos. Não pode ser igual ao número da nota
 * (regra do MOC), então se coincidir sorteia de novo.
 */
export function gerarCNF(numero: number): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 100_000_000;
    const cnf = String(n).padStart(8, "0");
    if (Number(cnf) !== numero) return cnf;
  }
}
