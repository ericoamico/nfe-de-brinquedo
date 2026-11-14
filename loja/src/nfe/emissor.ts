import { assinarXml } from "../../../comum/assinatura";
import type { CertificadoA1 } from "../../../comum/certificado";
import { gerarCNF } from "../../../comum/chave";
import type { Log } from "../../../comum/log";
import { primeiro, serializar, texto } from "../../../comum/xml";
import type { BancoLoja, Nota, SituacaoNota } from "../banco";
import type { ConfigLoja } from "../config";
import { type ClienteAutorizadora, ErroComunicacao } from "./cliente";
import { type FormaPagamento, montarEnviNFe, montarNFe, montarNfeProc } from "./montar";

/** Espera entre tentativas da fila: 30 s, 1 min, 2 min, 5 min e depois a cada 10 min. */
const ESPERAS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

export interface DependenciasEmissor {
  banco: BancoLoja;
  cliente: ClienteAutorizadora;
  certificado: CertificadoA1;
  config: ConfigLoja;
  log: Log;
  /** Chamado depois da autorização (DANFE + e-mail). Se lançar erro, a fila tenta de novo. */
  aposAutorizar: (pedidoId: number) => Promise<void>;
  agora?: () => number;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function novoIdLote(): string {
  const aleatorio = crypto.getRandomValues(new Uint16Array(1))[0]! % 100;
  return (String(Date.now()).slice(-13) + String(aleatorio).padStart(2, "0")).padStart(15, "0");
}

/**
 * Emissor de NF-e da loja. Regras importantes:
 * - Cada pedido tem UMA nota, criada junto com o pedido, com número e chave fixos.
 *   Reenvios usam sempre o mesmo XML assinado: nunca se gera número novo para a mesma venda.
 * - Se o envio falha sem resposta (timeout/conexão), a nota fica marcada como "envio incerto"
 *   e, antes de qualquer reenvio, consultamos a situação pela chave.
 * - O que não der para resolver agora vai para a fila de reprocessamento.
 */
export class Emissor {
  private emAndamento = new Map<number, Promise<SituacaoNota>>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private d: DependenciasEmissor) {}

  private agora() {
    return this.d.agora ? this.d.agora() : Date.now();
  }

  /** Cria a nota do pedido (número reservado + XML assinado). Rode dentro da transação do pedido. */
  criarNota(pedidoId: number): Nota {
    const { banco, config, certificado } = this.d;
    const pedido = banco.pedido(pedidoId)!;
    const itens = banco.itensPedido(pedidoId);
    const numero = banco.reservarNumero(config.serie);
    const montada = montarNFe({
      emitente: config.emitente,
      destinatario: {
        nome: pedido.nome,
        cpf: pedido.cpf,
        email: pedido.email,
        endereco: {
          logradouro: pedido.logradouro,
          numero: pedido.numero,
          complemento: pedido.complemento || undefined,
          bairro: pedido.bairro,
          // Sem tabela do IBGE aqui: município de brinquedo, já que a nota é de brinquedo.
          codigoMunicipio: "9999999",
          municipio: pedido.cidade,
          uf: pedido.uf,
          cep: pedido.cep,
          telefone: pedido.telefone,
        },
      },
      itens: itens.map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao,
        ncm: i.ncm,
        quantidade: i.quantidade,
        valorUnitario: i.valor_unitario,
      })),
      frete: pedido.frete,
      pagamento: pedido.pagamento as FormaPagamento,
      serie: config.serie,
      numero,
      cNF: gerarCNF(numero),
      emissao: new Date(this.agora()),
      tpAmb: config.tpAmb,
      pedido: pedido.codigo,
    });
    const xml = assinarXml(montada.xml, "infNFe", certificado.chavePem, certificado.certPem);
    banco.inserirNota({ pedido_id: pedidoId, serie: config.serie, numero, chave: montada.chave, xml_assinado: xml });
    this.d.log.info("nota.criada", { pedido: pedido.codigo, numero, serie: config.serie, chave: montada.chave });
    return banco.nota(pedidoId)!;
  }

  /** Emite (ou continua emitindo) a nota do pedido. Nunca roda duas vezes ao mesmo tempo para o mesmo pedido. */
  emitir(pedidoId: number): Promise<SituacaoNota> {
    const atual = this.emAndamento.get(pedidoId);
    if (atual) return atual;
    const p = this.executar(pedidoId).finally(() => this.emAndamento.delete(pedidoId));
    this.emAndamento.set(pedidoId, p);
    return p;
  }

  private async executar(pedidoId: number): Promise<SituacaoNota> {
    const { banco, log } = this.d;
    const nota = banco.nota(pedidoId);
    if (!nota) throw new Error(`pedido ${pedidoId} sem nota`);

    if (nota.situacao === "autorizada") {
      if (!nota.email_enviado_em) await this.entregar(pedidoId);
      return "autorizada";
    }
    if (nota.situacao === "rejeitada") return "rejeitada";

    try {
      // 1) Lote assíncrono pendente: consulta o recibo.
      if (nota.situacao === "aguardando_recibo" && nota.nrec) {
        return await this.acompanharRecibo(nota);
      }

      // 2) Envio anterior sem resposta: consulta pela chave ANTES de reenviar.
      if (nota.envio_incerto) {
        const r = await this.consultarPelaChave(nota);
        if (r) return r;
      }

      // 3) Envio (sempre o mesmo XML assinado).
      return await this.enviar(nota);
    } catch (e) {
      if (e instanceof ErroComunicacao) {
        log.aviso("nota.comunicacao_falhou", { pedidoId, chave: nota.chave, tipo: e.tipo, erro: e.message });
        return this.agendar(pedidoId, `falha de comunicação: ${e.tipo}`);
      }
      log.erro("nota.erro_inesperado", { pedidoId, erro: (e as Error).stack });
      return this.agendar(pedidoId, "erro inesperado");
    }
  }

  private async enviar(nota: Nota): Promise<SituacaoNota> {
    const { banco, cliente, log } = this.d;
    const idLote = novoIdLote();
    banco.atualizarNota(nota.pedido_id, { envio_incerto: 1, tentativas: nota.tentativas + 1 });
    log.info("nota.enviando", { chave: nota.chave, idLote, tentativa: nota.tentativas + 1 });

    let ret: Element;
    try {
      ret = await cliente.autorizar(montarEnviNFe(nota.xml_assinado, idLote));
    } catch (e) {
      if (!(e instanceof ErroComunicacao)) throw e;
      // Timeout ou conexão derrubada: a nota pode ter sido autorizada. Consulta pela chave.
      log.aviso("nota.envio_sem_resposta", { chave: nota.chave, tipo: e.tipo, erro: e.message });
      const r = await this.consultarPelaChave(nota);
      return r ?? this.agendar(nota.pedido_id, "envio sem resposta; nota não consta na autorizadora");
    }

    const cStat = Number(texto(ret, "cStat"));
    const xMotivo = texto(ret, "xMotivo");
    log.info("nota.retorno_lote", { chave: nota.chave, cStat, xMotivo });
    if (cStat === 104) return this.tratarProtocolo(nota, primeiro(ret, "protNFe"));
    if (cStat === 103) {
      const nRec = texto(ret, "nRec");
      banco.atualizarNota(nota.pedido_id, { situacao: "aguardando_recibo", nrec: nRec, envio_incerto: 0 });
      return this.acompanharRecibo({ ...nota, nrec: nRec, situacao: "aguardando_recibo" });
    }
    // Rejeição do lote inteiro (schema, versão...): a nota não foi processada.
    return this.rejeitar(nota, cStat, xMotivo);
  }

  /** Consulta o recibo algumas vezes; se ainda estiver em processamento, deixa para a fila. */
  private async acompanharRecibo(nota: Nota): Promise<SituacaoNota> {
    const { cliente, config, log } = this.d;
    for (let i = 0; i < config.tentativasRecibo; i++) {
      await dormir(config.intervaloReciboMs);
      const ret = await cliente.consultarRecibo(nota.nrec!);
      const cStat = Number(texto(ret, "cStat"));
      log.info("nota.retorno_recibo", { chave: nota.chave, nRec: nota.nrec, cStat, xMotivo: texto(ret, "xMotivo") });
      if (cStat === 104) return this.tratarProtocolo(nota, primeiro(ret, "protNFe"));
      if (cStat === 105) continue;
      if (cStat === 106) {
        // Recibo não localizado: volta para o caminho seguro (consulta pela chave e reenvia se preciso).
        this.d.banco.atualizarNota(nota.pedido_id, { situacao: "reprocessar", nrec: null, envio_incerto: 1 });
        return this.agendar(nota.pedido_id, "recibo não localizado");
      }
      return this.rejeitar(nota, cStat, texto(ret, "xMotivo"));
    }
    return this.agendar(nota.pedido_id, "lote ainda em processamento", "aguardando_recibo");
  }

  /** Consulta a situação pela chave. Devolve a situação final ou null se a nota não consta (217). */
  private async consultarPelaChave(nota: Nota): Promise<SituacaoNota | null> {
    const ret = await this.d.cliente.consultarChave(nota.chave);
    const cStat = Number(texto(ret, "cStat"));
    this.d.log.info("nota.consulta_chave", { chave: nota.chave, cStat, xMotivo: texto(ret, "xMotivo") });
    if (cStat === 100) return this.tratarProtocolo(nota, primeiro(ret, "protNFe"));
    if (cStat === 217) {
      this.d.banco.atualizarNota(nota.pedido_id, { envio_incerto: 0 });
      return null;
    }
    // Qualquer outra resposta na consulta é inesperada: deixa para a fila.
    return this.agendar(nota.pedido_id, `consulta retornou ${cStat}`);
  }

  private async tratarProtocolo(nota: Nota, prot: Element | null): Promise<SituacaoNota> {
    if (!prot) throw new ErroComunicacao("resposta-invalida", "retorno sem protNFe");
    const cStat = Number(texto(prot, "cStat"));
    const xMotivo = texto(prot, "xMotivo");
    if (cStat === 100) {
      const protXml = serializar(prot);
      this.d.banco.atualizarNota(nota.pedido_id, {
        situacao: "autorizada",
        envio_incerto: 0,
        nprot: texto(prot, "nProt"),
        xml_proc: montarNfeProc(nota.xml_assinado, protXml),
        ultimo_cstat: 100,
        ultimo_motivo: xMotivo,
        proxima_tentativa: null,
      });
      this.d.log.info("nota.autorizada", { chave: nota.chave, nProt: texto(prot, "nProt") });
      await this.entregar(nota.pedido_id);
      return "autorizada";
    }
    if (cStat === 204) {
      // Duplicidade: esta mesma nota já foi autorizada antes (resposta perdida). Busca o protocolo.
      this.d.log.info("nota.duplicidade_recupera_protocolo", { chave: nota.chave });
      const r = await this.consultarPelaChave(nota);
      return r ?? this.agendar(nota.pedido_id, "204 sem nota na consulta");
    }
    return this.rejeitar(nota, cStat, xMotivo);
  }

  private rejeitar(nota: Nota, cStat: number, xMotivo: string): SituacaoNota {
    this.d.banco.atualizarNota(nota.pedido_id, {
      situacao: "rejeitada",
      envio_incerto: 0,
      ultimo_cstat: cStat,
      ultimo_motivo: xMotivo,
      proxima_tentativa: null,
    });
    // Rejeição exige correção manual: fica registrada no log para a equipe.
    this.d.log.erro("nota.rejeitada", { pedidoId: nota.pedido_id, chave: nota.chave, cStat, xMotivo });
    return "rejeitada";
  }

  private agendar(pedidoId: number, motivo: string, situacao: SituacaoNota = "reprocessar"): SituacaoNota {
    const nota = this.d.banco.nota(pedidoId)!;
    const espera = ESPERAS_MS[Math.min(Math.max(nota.tentativas - 1, 0), ESPERAS_MS.length - 1)]!;
    const manter = nota.situacao === "autorizada" ? "autorizada" : situacao;
    this.d.banco.atualizarNota(pedidoId, {
      situacao: manter,
      proxima_tentativa: this.agora() + espera,
      ultimo_motivo: motivo,
    });
    this.d.log.info("nota.reprocessamento_agendado", { pedidoId, motivo, emSegundos: espera / 1000 });
    return manter;
  }

  /** DANFE + e-mail. Falhas aqui não desfazem a autorização; a fila tenta de novo. */
  private async entregar(pedidoId: number): Promise<void> {
    try {
      await this.d.aposAutorizar(pedidoId);
      this.d.banco.atualizarNota(pedidoId, { email_enviado_em: new Date(this.agora()).toISOString(), proxima_tentativa: null });
    } catch (e) {
      this.d.log.erro("nota.entrega_falhou", { pedidoId, erro: (e as Error).message });
      const nota = this.d.banco.nota(pedidoId)!;
      this.d.banco.atualizarNota(pedidoId, {
        tentativas: nota.tentativas + 1,
        proxima_tentativa: this.agora() + ESPERAS_MS[Math.min(nota.tentativas, ESPERAS_MS.length - 1)]!,
      });
    }
  }

  /** Uma passada da fila: tudo que está pendente e com a próxima tentativa vencida. */
  async processarFila(): Promise<void> {
    const ids = this.d.banco.notasParaReprocessar(this.agora());
    for (const id of ids) {
      if (this.emAndamento.has(id)) continue;
      await this.emitir(id);
    }
  }

  iniciarFila(): void {
    if (this.timer) return;
    let rodando = false;
    this.timer = setInterval(async () => {
      if (rodando) return;
      rodando = true;
      try {
        await this.processarFila();
      } catch (e) {
        this.d.log.erro("fila.erro", { erro: (e as Error).message });
      } finally {
        rodando = false;
      }
    }, this.d.config.intervaloFilaMs);
  }

  pararFila(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Espera as emissões em andamento terminarem (usado ao desligar e nos testes). */
  async aguardar(): Promise<void> {
    await Promise.allSettled([...this.emAndamento.values()]);
  }
}
