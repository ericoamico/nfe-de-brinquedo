import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type SituacaoNota =
  | "pendente" // criada, ainda não enviada
  | "aguardando_recibo" // a autorizadora respondeu 103
  | "reprocessar" // falhou a comunicação; a fila tenta de novo
  | "autorizada"
  | "rejeitada";

export interface Pedido {
  id: number;
  codigo: string;
  sessao: string;
  criado_em: string;
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
  entrega: "economica" | "expressa";
  frete: number;
  pagamento: "pix" | "boleto" | "cartao";
  parcelas: number;
  subtotal: number;
  total: number;
}

export interface ItemPedido {
  pedido_id: number;
  produto: string;
  codigo: string;
  descricao: string;
  ncm: string;
  quantidade: number;
  valor_unitario: number;
}

export interface Nota {
  pedido_id: number;
  serie: number;
  numero: number;
  chave: string;
  xml_assinado: string;
  situacao: SituacaoNota;
  envio_incerto: number;
  nrec: string | null;
  nprot: string | null;
  xml_proc: string | null;
  tentativas: number;
  proxima_tentativa: number | null;
  ultimo_cstat: number | null;
  ultimo_motivo: string | null;
  email_enviado_em: string | null;
  atualizado_em: string;
}

export function abrirBanco(caminho: string) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS carrinho (
      sessao TEXT NOT NULL, produto TEXT NOT NULL, quantidade INTEGER NOT NULL,
      PRIMARY KEY (sessao, produto)
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE, sessao TEXT NOT NULL, criado_em TEXT NOT NULL,
      nome TEXT NOT NULL, email TEXT NOT NULL, cpf TEXT NOT NULL, telefone TEXT NOT NULL,
      cep TEXT NOT NULL, logradouro TEXT NOT NULL, numero TEXT NOT NULL, complemento TEXT NOT NULL,
      bairro TEXT NOT NULL, cidade TEXT NOT NULL, uf TEXT NOT NULL,
      entrega TEXT NOT NULL, frete INTEGER NOT NULL, pagamento TEXT NOT NULL, parcelas INTEGER NOT NULL,
      subtotal INTEGER NOT NULL, total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedido_itens (
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id), produto TEXT NOT NULL, codigo TEXT NOT NULL,
      descricao TEXT NOT NULL, ncm TEXT NOT NULL, quantidade INTEGER NOT NULL, valor_unitario INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS acessos (
      sessao TEXT NOT NULL, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
      PRIMARY KEY (sessao, pedido_id)
    );
    -- Uma nota por pedido, com número fixo: reenvios usam sempre o mesmo XML.
    CREATE TABLE IF NOT EXISTS notas (
      pedido_id INTEGER PRIMARY KEY REFERENCES pedidos(id),
      serie INTEGER NOT NULL, numero INTEGER NOT NULL, chave TEXT NOT NULL UNIQUE,
      xml_assinado TEXT NOT NULL,
      situacao TEXT NOT NULL,
      envio_incerto INTEGER NOT NULL DEFAULT 0,
      nrec TEXT, nprot TEXT, xml_proc TEXT,
      tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa INTEGER,
      ultimo_cstat INTEGER, ultimo_motivo TEXT,
      email_enviado_em TEXT,
      atualizado_em TEXT NOT NULL,
      UNIQUE (serie, numero)
    );
    CREATE TABLE IF NOT EXISTS numeracao (serie INTEGER PRIMARY KEY, ultimo INTEGER NOT NULL);
  `);

  const agoraIso = () => new Date().toISOString();

  const api = {
    db,
    // Carrinho -------------------------------------------------------------
    itensCarrinho: (sessao: string) =>
      db.query("SELECT produto, quantidade FROM carrinho WHERE sessao = ? ORDER BY rowid").all(sessao) as {
        produto: string;
        quantidade: number;
      }[],
    adicionarAoCarrinho: (sessao: string, produto: string, quantidade: number) =>
      db
        .query(
          `INSERT INTO carrinho (sessao, produto, quantidade) VALUES (?1, ?2, ?3)
           ON CONFLICT (sessao, produto) DO UPDATE SET quantidade = MIN(quantidade + ?3, 10)`,
        )
        .run(sessao, produto, quantidade),
    definirQuantidade: (sessao: string, produto: string, quantidade: number) =>
      quantidade <= 0
        ? db.query("DELETE FROM carrinho WHERE sessao = ? AND produto = ?").run(sessao, produto)
        : db.query("UPDATE carrinho SET quantidade = ? WHERE sessao = ? AND produto = ?").run(quantidade, sessao, produto),
    esvaziarCarrinho: (sessao: string) => db.query("DELETE FROM carrinho WHERE sessao = ?").run(sessao),

    // Pedidos ----------------------------------------------------------------
    inserirPedido: (p: Omit<Pedido, "id" | "codigo" | "criado_em">, itens: Omit<ItemPedido, "pedido_id">[]) => {
      const { id } = db
        .query(
          `INSERT INTO pedidos (codigo, sessao, criado_em, nome, email, cpf, telefone, cep, logradouro, numero,
             complemento, bairro, cidade, uf, entrega, frete, pagamento, parcelas, subtotal, total)
           VALUES ('', $sessao, $criado_em, $nome, $email, $cpf, $telefone, $cep, $logradouro, $numero,
             $complemento, $bairro, $cidade, $uf, $entrega, $frete, $pagamento, $parcelas, $subtotal, $total)
           RETURNING id`,
        )
        .get({ ...p, criado_em: agoraIso() } as any) as { id: number };
      const codigo = String(100000 + id);
      db.query("UPDATE pedidos SET codigo = ? WHERE id = ?").run(codigo, id);
      const ins = db.query(
        `INSERT INTO pedido_itens (pedido_id, produto, codigo, descricao, ncm, quantidade, valor_unitario)
         VALUES ($pedido_id, $produto, $codigo, $descricao, $ncm, $quantidade, $valor_unitario)`,
      );
      for (const i of itens) ins.run({ ...i, pedido_id: id } as any);
      return { id, codigo };
    },
    pedido: (id: number) => db.query("SELECT * FROM pedidos WHERE id = ?").get(id) as Pedido | null,
    pedidoPorCodigo: (codigo: string) => db.query("SELECT * FROM pedidos WHERE codigo = ?").get(codigo) as Pedido | null,
    itensPedido: (id: number) =>
      db.query("SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY rowid").all(id) as ItemPedido[],
    pedidosDaSessao: (sessao: string) =>
      db
        .query(
          `SELECT * FROM pedidos WHERE sessao = ?1
             OR id IN (SELECT pedido_id FROM acessos WHERE sessao = ?1)
           ORDER BY id DESC`,
        )
        .all(sessao) as Pedido[],
    podeVerPedido: (sessao: string, p: Pedido) =>
      p.sessao === sessao ||
      !!db.query("SELECT 1 FROM acessos WHERE sessao = ? AND pedido_id = ?").get(sessao, p.id),
    liberarAcesso: (sessao: string, pedidoId: number) =>
      db.query("INSERT OR IGNORE INTO acessos (sessao, pedido_id) VALUES (?, ?)").run(sessao, pedidoId),

    // Notas -------------------------------------------------------------------
    /** Reserva o próximo número da série. Só deve ser chamado dentro da transação que cria a nota. */
    reservarNumero: (serie: number) =>
      (
        db
          .query(
            `INSERT INTO numeracao (serie, ultimo) VALUES (?1, 1)
             ON CONFLICT (serie) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo`,
          )
          .get(serie) as { ultimo: number }
      ).ultimo,
    inserirNota: (n: Pick<Nota, "pedido_id" | "serie" | "numero" | "chave" | "xml_assinado">) =>
      db
        .query(
          `INSERT INTO notas (pedido_id, serie, numero, chave, xml_assinado, situacao, atualizado_em)
           VALUES ($pedido_id, $serie, $numero, $chave, $xml_assinado, 'pendente', $atualizado_em)`,
        )
        .run({ ...n, atualizado_em: agoraIso() } as any),
    nota: (pedidoId: number) => db.query("SELECT * FROM notas WHERE pedido_id = ?").get(pedidoId) as Nota | null,
    atualizarNota: (pedidoId: number, campos: Partial<Omit<Nota, "pedido_id">>) => {
      const todos = { ...campos, atualizado_em: agoraIso() };
      const sets = Object.keys(todos)
        .map((k) => `${k} = $${k}`)
        .join(", ");
      db.query(`UPDATE notas SET ${sets} WHERE pedido_id = $pedido_id`).run({ ...todos, pedido_id: pedidoId } as any);
    },
    /** Notas que a fila de reprocessamento precisa olhar agora. */
    notasParaReprocessar: (agora: number) =>
      db
        .query(
          `SELECT pedido_id FROM notas
           WHERE (situacao IN ('pendente', 'reprocessar', 'aguardando_recibo')
                  AND (proxima_tentativa IS NULL OR proxima_tentativa <= ?1))
              OR (situacao = 'autorizada' AND email_enviado_em IS NULL
                  AND (proxima_tentativa IS NULL OR proxima_tentativa <= ?1))
           ORDER BY pedido_id`,
        )
        .all(agora)
        .map((r: any) => r.pedido_id as number),
    fechar: () => db.close(),
  };
  return api;
}

export type BancoLoja = ReturnType<typeof abrirBanco>;
