import type { DadosNota, Emitente } from "../loja/src/nfe/montar";

export const EMITENTE_TESTE: Emitente = {
  cnpj: "99999001000159",
  razaoSocial: "Loja do Erico (ficticia)",
  nomeFantasia: "Loja do Érico (fictícia)",
  ie: "999000111",
  crt: 1,
  cUF: 99,
  endereco: {
    logradouro: "Rua dos Brinquedos", numero: "100", bairro: "Centro", codigoMunicipio: "9900001",
    municipio: "Cidade de Brinquedo", uf: "ZZ", cep: "99000000", telefone: "0000000000",
  },
};

export function dadosNotaTeste(extra: Partial<DadosNota> = {}): DadosNota {
  return {
    emitente: EMITENTE_TESTE,
    destinatario: {
      nome: "Maria da Silva", cpf: "52998224725", email: "maria@example.com",
      endereco: { logradouro: "Rua das Flores", numero: "12", bairro: "Jardim", codigoMunicipio: "4314902",
        municipio: "Porto Alegre", uf: "RS", cep: "90000-000" },
    },
    itens: [
      { codigo: "CAN-350", descricao: "Caneca de cerâmica Aurora 350 ml", ncm: "69120000", quantidade: 2, valorUnitario: 4990 },
      { codigo: "GAR-750", descricao: "Garrafa térmica Serra 750 ml", ncm: "96170010", quantidade: 1, valorUnitario: 12990 },
    ],
    frete: 1590,
    pagamento: "pix",
    serie: 1,
    numero: 1,
    cNF: "12345678",
    emissao: new Date(Date.now() - 60_000),
    tpAmb: 2,
    pedido: "1001",
    ...extra,
  };
}
