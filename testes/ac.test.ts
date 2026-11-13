import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { gerarCertificadosDeTeste } from "./auxiliar";

describe("script da AC de brinquedo", () => {
  test("gera raiz, pfx da loja e certificado da autorizadora válidos", () => {
    const c = gerarCertificadosDeTeste();
    for (const f of [c.raiz, c.pfx, c.servidorCrt, c.servidorKey]) expect(existsSync(f)).toBe(true);
    const v = Bun.spawnSync(["openssl", "verify", "-CAfile", c.raiz, c.servidorCrt, `${c.dir}/loja.crt`]);
    expect(v.exitCode).toBe(0);
    const p = Bun.spawnSync(["openssl", "pkcs12", "-in", c.pfx, "-passin", `pass:${c.senha}`, "-nokeys"]);
    expect(p.exitCode).toBe(0);
    const errada = Bun.spawnSync(["openssl", "pkcs12", "-in", c.pfx, "-passin", "pass:errada", "-nokeys"]);
    expect(errada.exitCode).not.toBe(0);
  });
});
