import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface NotaAutorizada {
  chave: string;
  cnpj: string;
  modelo: string;
  serie: number;
  numero: number;
  nprot: string;
  nrec: string;
  dh_recbto: string;
  dig_val: string;
  emitente: string;
  destinatario: string;
  cpf_dest: string;
  valor: string;
  dh_emi: string;
  xml_nfe: string;
  prot_nfe: string;
}

export interface Lote {
  nrec: string;
  recebido_em: string;
  pronto_em: number;
  envi_nfe: string;
  ret: string | null;
}

export function abrirBanco(caminho: string) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notas (
      chave TEXT PRIMARY KEY,
      cnpj TEXT NOT NULL, modelo TEXT NOT NULL, serie INTEGER NOT NULL, numero INTEGER NOT NULL,
      nprot TEXT NOT NULL UNIQUE, nrec TEXT NOT NULL, dh_recbto TEXT NOT NULL, dig_val TEXT NOT NULL,
      emitente TEXT NOT NULL, destinatario TEXT NOT NULL, cpf_dest TEXT NOT NULL,
      valor TEXT NOT NULL, dh_emi TEXT NOT NULL,
      xml_nfe TEXT NOT NULL, prot_nfe TEXT NOT NULL,
      UNIQUE (cnpj, modelo, serie, numero)
    );
    CREATE TABLE IF NOT EXISTS sequencias (nome TEXT PRIMARY KEY, valor INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lotes (
      nrec TEXT PRIMARY KEY, recebido_em TEXT NOT NULL, pronto_em INTEGER NOT NULL,
      envi_nfe TEXT NOT NULL, ret TEXT
    );
    CREATE TABLE IF NOT EXISTS rejeicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quando TEXT NOT NULL,
      chave TEXT, cstat INTEGER NOT NULL, xmotivo TEXT NOT NULL
    );
  `);

  const proximo = db.prepare(
    `INSERT INTO sequencias (nome, valor) VALUES (?1, 1)
     ON CONFLICT(nome) DO UPDATE SET valor = valor + 1 RETURNING valor`,
  );

  return {
    db,
    proximaSequencia: (nome: string) => (proximo.get(nome) as { valor: number }).valor,
    notaPorChave: (chave: string) =>
      db.query("SELECT * FROM notas WHERE chave = ?").get(chave) as NotaAutorizada | null,
    notaPorNumero: (cnpj: string, modelo: string, serie: number, numero: number) =>
      db
        .query("SELECT * FROM notas WHERE cnpj = ? AND modelo = ? AND serie = ? AND numero = ?")
        .get(cnpj, modelo, serie, numero) as NotaAutorizada | null,
    ultimoNumero: (cnpj: string, modelo: string, serie: number) =>
      ((db.query("SELECT MAX(numero) AS n FROM notas WHERE cnpj = ? AND modelo = ? AND serie = ?").get(cnpj, modelo, serie) as {
        n: number | null;
      })?.n ?? 0),
    inserirNota: (n: NotaAutorizada) =>
      db
        .query(
          `INSERT INTO notas (chave, cnpj, modelo, serie, numero, nprot, nrec, dh_recbto, dig_val, emitente,
             destinatario, cpf_dest, valor, dh_emi, xml_nfe, prot_nfe)
           VALUES ($chave, $cnpj, $modelo, $serie, $numero, $nprot, $nrec, $dh_recbto, $dig_val, $emitente,
             $destinatario, $cpf_dest, $valor, $dh_emi, $xml_nfe, $prot_nfe)`,
        )
        .run(n as any),
    registrarRejeicao: (chave: string | null, cstat: number, xmotivo: string) =>
      db
        .query("INSERT INTO rejeicoes (quando, chave, cstat, xmotivo) VALUES (?, ?, ?, ?)")
        .run(new Date().toISOString(), chave, cstat, xmotivo),
    inserirLote: (l: Lote) =>
      db
        .query("INSERT INTO lotes (nrec, recebido_em, pronto_em, envi_nfe, ret) VALUES ($nrec, $recebido_em, $pronto_em, $envi_nfe, $ret)")
        .run(l as any),
    lote: (nrec: string) => db.query("SELECT * FROM lotes WHERE nrec = ?").get(nrec) as Lote | null,
    gravarRetornoLote: (nrec: string, ret: string) =>
      db.query("UPDATE lotes SET ret = ? WHERE nrec = ?").run(ret, nrec),
    fechar: () => db.close(),
  };
}

export type BancoAutorizadora = ReturnType<typeof abrirBanco>;
