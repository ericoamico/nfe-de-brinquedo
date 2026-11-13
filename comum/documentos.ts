export const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export function cpfValido(entrada: string): boolean {
  const cpf = soDigitos(entrada);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(cpf.slice(0, 9));
  const d2 = dv(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`);
}

export function cnpjValido(entrada: string): boolean {
  const cnpj = soDigitos(entrada);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let t = 0;
    for (let i = 0; i < base.length; i++) t += Number(base[i]) * pesos[i]!;
    const r = t % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function formatarCPF(cpf: string): string {
  return soDigitos(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarCNPJ(cnpj: string): string {
  return soDigitos(cnpj).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** CPF parcialmente oculto, para páginas públicas: ***.456.789-** */
export function mascararCPF(cpf: string): string {
  const f = formatarCPF(cpf);
  return f.length === 14 ? `***.${f.slice(4, 11)}-**` : "***";
}

export function formatarCEP(cep: string): string {
  return soDigitos(cep).replace(/(\d{5})(\d{3})/, "$1-$2");
}
