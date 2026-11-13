/**
 * Log estruturado (uma linha JSON por evento) para o servidor. Todo detalhe
 * técnico (cStat, xMotivo, recibos, protocolos) vai para cá, nunca para a tela.
 */
type Nivel = "debug" | "info" | "aviso" | "erro";

const ordem: Record<Nivel, number> = { debug: 10, info: 20, aviso: 30, erro: 40 };

export function criarLog(servico: string) {
  const minimo = ordem[(process.env.LOG_NIVEL as Nivel) ?? "info"] ?? 20;
  const silencioso = process.env.LOG_SILENCIOSO === "1";
  const escrever = (nivel: Nivel, evento: string, dados?: Record<string, unknown>) => {
    if (silencioso || ordem[nivel] < minimo) return;
    const linha = JSON.stringify({ t: new Date().toISOString(), servico, nivel, evento, ...dados });
    (nivel === "erro" || nivel === "aviso" ? console.error : console.log)(linha);
  };
  return {
    debug: (e: string, d?: Record<string, unknown>) => escrever("debug", e, d),
    info: (e: string, d?: Record<string, unknown>) => escrever("info", e, d),
    aviso: (e: string, d?: Record<string, unknown>) => escrever("aviso", e, d),
    erro: (e: string, d?: Record<string, unknown>) => escrever("erro", e, d),
  };
}

export type Log = ReturnType<typeof criarLog>;
