import { describe, expect, test } from "bun:test";
import { calcularDV, chaveValida, desmontarChave, formatarChave, gerarCNF, montarChave } from "../comum/chave";
import { cnpjValido, cpfValido, mascararCPF } from "../comum/documentos";

describe("chave de acesso", () => {
  test("DV módulo 11 confere com o exemplo do Manual de Orientação (DV = 5)", () => {
    const base = "5206043300991100250655012000000780026730161";
    expect(calcularDV(base)).toBe(5);
  });

  test("resto 0 ou 1 gera DV 0", () => {
    // procura bases com resto 0 e 1 e confere a regra
    let achou0 = false, achou1 = false;
    for (let i = 0; i < 200 && !(achou0 && achou1); i++) {
      const base = String(i).padStart(43, "0");
      let soma = 0, peso = 2;
      for (let j = 42; j >= 0; j--) { soma += Number(base[j]) * peso; peso = peso === 9 ? 2 : peso + 1; }
      const r = soma % 11;
      if (r === 0) { achou0 = true; expect(calcularDV(base)).toBe(0); }
      if (r === 1) { achou1 = true; expect(calcularDV(base)).toBe(0); }
    }
    expect(achou0 && achou1).toBe(true);
  });

  test("monta, valida e desmonta com cUF 99", () => {
    const chave = montarChave({ cUF: 99, aamm: "2611", cnpj: "99999001000159", modelo: 55, serie: 1, numero: 42, tpEmis: 1, cNF: "12345678" });
    expect(chave).toHaveLength(44);
    expect(chave.startsWith("992611")).toBe(true);
    expect(chaveValida(chave)).toBe(true);
    const p = desmontarChave(chave);
    expect(p).toMatchObject({ cUF: "99", cnpj: "99999001000159", modelo: "55", serie: "001", numero: "000000042", cNF: "12345678" });
    const errada = chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10);
    expect(chaveValida(errada)).toBe(false);
    expect(formatarChave(chave).split(" ")).toHaveLength(11);
  });

  test("cNF nunca é igual ao número da nota", () => {
    for (let i = 0; i < 50; i++) expect(Number(gerarCNF(7))).not.toBe(7);
  });
});

describe("CPF e CNPJ", () => {
  test("CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(mascararCPF("52998224725")).toBe("***.982.247-**");
  });
  test("CNPJ fictício da loja é válido", () => {
    expect(cnpjValido("99999001000159")).toBe(true);
    expect(cnpjValido("99999001000158")).toBe(false);
  });
});
