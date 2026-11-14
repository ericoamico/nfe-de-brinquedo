import { cpfValido, soDigitos } from "../../comum/documentos";
import { ENTREGAS, PAGAMENTOS, type TipoEntrega, UFS } from "./catalogo";

export interface DadosCheckout {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  entrega: string;
  pagamento: string;
  parcelas: string;
}

export type Erros = Partial<Record<keyof DadosCheckout, string>>;

/** Ordem dos campos na tela (o resumo de erros segue essa ordem). */
export const ORDEM_CAMPOS: (keyof DadosCheckout)[] = [
  "nome", "email", "cpf", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
  "entrega", "pagamento", "parcelas",
];

export const vazio = (): DadosCheckout => ({
  nome: "", email: "", cpf: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", entrega: "economica", pagamento: "pix", parcelas: "1",
});

export function lerFormulario(form: Record<string, unknown>): DadosCheckout {
  const d = vazio();
  for (const k of ORDEM_CAMPOS) {
    const v = form[k];
    if (typeof v === "string") d[k] = v.trim().replace(/\s+/g, " ").slice(0, 120);
  }
  return d;
}

export function validar(d: DadosCheckout): Erros {
  const e: Erros = {};
  if (d.nome.length < 5 || !d.nome.includes(" ")) e.nome = "Informe seu nome completo, com sobrenome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = "Informe um e-mail válido, como nome@exemplo.com.";
  if (!cpfValido(d.cpf)) e.cpf = "Confira o CPF: os números informados não formam um CPF válido.";
  const tel = soDigitos(d.telefone);
  if (tel.length < 10 || tel.length > 11) e.telefone = "Informe o telefone com DDD, por exemplo (51) 99999-9999.";
  if (soDigitos(d.cep).length !== 8) e.cep = "O CEP tem 8 números, por exemplo 90000-000.";
  if (d.logradouro.length < 3) e.logradouro = "Informe a rua, avenida ou travessa.";
  if (!d.numero) e.numero = "Informe o número. Se não houver, escreva S/N.";
  if (d.bairro.length < 2) e.bairro = "Informe o bairro.";
  if (d.cidade.length < 2) e.cidade = "Informe a cidade.";
  if (!UFS.some(([sigla]) => sigla === d.uf)) e.uf = "Escolha o estado.";
  if (!(d.entrega in ENTREGAS)) e.entrega = "Escolha uma forma de entrega.";
  if (!(d.pagamento in PAGAMENTOS)) e.pagamento = "Escolha uma forma de pagamento.";
  const parcelas = Number(d.parcelas);
  if (d.pagamento === "cartao" && !(Number.isInteger(parcelas) && parcelas >= 1 && parcelas <= 6)) {
    e.parcelas = "Escolha em quantas vezes quer pagar.";
  }
  return e;
}

export const entregaValida = (s: string): s is TipoEntrega => s in ENTREGAS;
