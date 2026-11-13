import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const RAIZ_PROJETO = resolve(import.meta.dir, "..");
export const SENHA_TESTE = "senha-de-teste";

export interface CertificadosTeste {
  dir: string;
  raiz: string;
  pfx: string;
  senha: string;
  servidorCrt: string;
  servidorKey: string;
}

let cache: CertificadosTeste | undefined;

/** Gera (uma vez por processo de teste) uma AC de brinquedo novinha numa pasta temporária. */
export function gerarCertificadosDeTeste(): CertificadosTeste {
  if (cache) return cache;
  const dir = mkdtempSync(join(tmpdir(), "ac-teste-"));
  const r = Bun.spawnSync(["bash", join(RAIZ_PROJETO, "ac/gerar-ac.sh")], {
    env: { ...process.env, AC_SAIDA: dir, AC_SENHA_PFX: SENHA_TESTE },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error("falha ao gerar AC de teste: " + r.stderr.toString());
  cache = {
    dir,
    raiz: join(dir, "raiz.crt"),
    pfx: join(dir, "loja.pfx"),
    senha: SENHA_TESTE,
    servidorCrt: join(dir, "autorizadora.crt"),
    servidorKey: join(dir, "autorizadora.key"),
  };
  return cache;
}

/** Gera um certificado cliente autoassinado, de fora da AC de brinquedo. */
export function gerarCertificadoIntruso(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), "intruso-"));
  const r = Bun.spawnSync([
    "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-keyout", join(dir, "i.key"), "-out", join(dir, "i.crt"),
    "-subj", "/CN=INTRUSO:99999001000159",
  ], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return { key: join(dir, "i.key"), cert: join(dir, "i.crt") };
}

/** Uma segunda AC de brinquedo, independente da primeira (para testar "AC desconhecida"). */
export function gerarOutraAC(): CertificadosTeste {
  const dir = mkdtempSync(join(tmpdir(), "outra-ac-"));
  const r = Bun.spawnSync(["bash", join(RAIZ_PROJETO, "ac/gerar-ac.sh")], {
    env: { ...process.env, AC_SAIDA: dir, AC_SENHA_PFX: SENHA_TESTE },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return {
    dir, raiz: join(dir, "raiz.crt"), pfx: join(dir, "loja.pfx"), senha: SENHA_TESTE,
    servidorCrt: join(dir, "autorizadora.crt"), servidorKey: join(dir, "autorizadora.key"),
  };
}

import { readFileSync } from "node:fs";
import type { ConfigAutorizadora } from "../autorizadora/src/config";

/** Configuração de autorizadora para teste: portas livres, banco em memória, caos desligado. */
export function configAutorizadoraTeste(c: CertificadosTeste, extra: Partial<ConfigAutorizadora> = {}): ConfigAutorizadora {
  return {
    portaWs: 0,
    hostWs: "127.0.0.1",
    portaPublica: 0,
    hostPublico: "127.0.0.1",
    mtlsModo: "direto",
    certPem: readFileSync(c.servidorCrt, "utf8"),
    chavePem: readFileSync(c.servidorKey, "utf8"),
    caPem: readFileSync(c.raiz, "utf8"),
    banco: ":memory:",
    tpAmb: 2,
    cUF: 99,
    loteAssincronoMs: 200,
    caos: { ativo: false, probabilidade: 0, atrasoMaxMs: 2000 },
    ...extra,
  };
}
