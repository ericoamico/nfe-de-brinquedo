import { formatarCEP } from "../../../comum/documentos";
import type { ItemPedido, Nota, Pedido } from "../banco";
import { dinheiro, ENTREGAS, PAGAMENTOS, UFS } from "../catalogo";
import { Aviso } from "./carrinho";

export interface MensagemNota {
  pronta: boolean;
  resumo: string;
  texto: string;
}

/** O que dizer ao cliente sobre a nota fiscal, sem nenhum detalhe técnico. */
export function mensagemNota(nota: Nota | null): MensagemNota {
  if (nota?.situacao === "autorizada" && nota.email_enviado_em) {
    return { pronta: true, resumo: "Nota fiscal enviada por e-mail", texto: "A nota fiscal foi enviada para o seu e-mail." };
  }
  if (nota?.situacao === "autorizada") {
    return {
      pronta: true,
      resumo: "Nota fiscal emitida",
      texto: "A nota fiscal foi emitida e chega no seu e-mail em instantes.",
    };
  }
  if (nota?.situacao === "rejeitada") {
    return {
      pronta: false,
      resumo: "Nota fiscal em emissão",
      texto:
        "Tivemos um problema ao emitir a sua nota fiscal e nossa equipe já está cuidando disso. Assim que ela for emitida, enviamos para o seu e-mail.",
    };
  }
  return {
    pronta: false,
    resumo: "Nota fiscal em emissão",
    texto: "Não conseguimos emitir a nota agora, já estamos tentando de novo. Assim que ela for emitida, enviamos para o seu e-mail.",
  };
}

function pagamentoTexto(p: Pedido): string {
  if (p.pagamento === "cartao") {
    const parcela = dinheiro(Math.ceil(p.total / p.parcelas));
    return p.parcelas > 1
      ? `Cartão de crédito em ${p.parcelas}x de ${parcela} sem juros (aprovado)`
      : "Cartão de crédito à vista (aprovado)";
  }
  return `${PAGAMENTOS[p.pagamento]} (pagamento aprovado)`;
}

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Soma dias úteis (segunda a sexta) a uma data. */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio);
  let faltam = dias;
  while (faltam > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) faltam--;
  }
  return d;
}

export function previsaoEntrega(p: Pedido): string {
  const max = p.entrega === "expressa" ? 3 : 8;
  return dataCurta(somarDiasUteis(new Date(p.criado_em), max).toISOString());
}

const nomeUF = (sigla: string) => UFS.find(([s]) => s === sigla)?.[1] ?? sigla;

export function PaginaPedido(p: {
  pedido: Pedido;
  itens: ItemPedido[];
  nota: Nota | null;
  novo: boolean;
  urlConsulta: string;
}) {
  const { pedido } = p;
  const msg = mensagemNota(p.nota);
  const endereco = [
    `${pedido.logradouro}, ${pedido.numero}${pedido.complemento ? `, ${pedido.complemento}` : ""}`,
    `${pedido.bairro}, ${pedido.cidade}, ${nomeUF(pedido.uf)}`,
    `CEP ${formatarCEP(pedido.cep)}`,
  ];
  return (
    <>
      {p.novo ? (
        <section class="confirmacao" aria-labelledby="titulo-pedido">
          <span class="selo-ok" aria-hidden="true">
            ✓
          </span>
          <h1 id="titulo-pedido">Pedido confirmado!</h1>
          <p>{msg.texto}</p>
          <p>
            Obrigado pela compra, {pedido.nome.split(" ")[0]}. O número do seu pedido é <strong>{pedido.codigo}</strong>.
            Guarde esse número para acompanhar a entrega.
          </p>
        </section>
      ) : (
        <>
          <nav class="migalhas" aria-label="Você está em">
            <ol>
              <li>
                <a href="/pedidos">Meus pedidos</a>
              </li>
              <li>
                <span aria-current="page">Pedido {pedido.codigo}</span>
              </li>
            </ol>
          </nav>
          <h1 id="titulo-pedido">Pedido {pedido.codigo}</h1>
        </>
      )}

      <div class="colunas">
        <div>
          <h2>Situação</h2>
          <dl class="dados">
            <dt>Pedido feito em</dt>
            <dd>{dataCurta(pedido.criado_em)}</dd>
            <dt>Pagamento</dt>
            <dd>{pagamentoTexto(pedido)}</dd>
            <dt>Entrega</dt>
            <dd>
              {ENTREGAS[pedido.entrega].nome}, previsão até {previsaoEntrega(pedido)}
            </dd>
            <dt>Nota fiscal</dt>
            <dd>
              <span class={`situacao ${msg.pronta ? "ok" : "espera"}`}>{msg.resumo}</span>
            </dd>
          </dl>
          {!p.novo && !msg.pronta ? <p>{msg.texto}</p> : null}

          {msg.pronta ? (
            <>
              <h2>Nota fiscal</h2>
              <ul>
                <li>
                  <a href={`/pedido/${pedido.codigo}/nota-fiscal.pdf`} download>
                    Baixar a nota fiscal em PDF
                  </a>
                </li>
                <li>
                  <a href={`/pedido/${pedido.codigo}/nota-fiscal.xml`} download>
                    Baixar o arquivo XML da nota fiscal
                  </a>
                </li>
                <li>
                  <a href={`${p.urlConsulta}?chave=${p.nota!.chave}`}>
                    Verificar a autenticidade da nota no site da Receita de Brinquedo
                  </a>
                </li>
              </ul>
            </>
          ) : null}

          <h2>Endereço de entrega</h2>
          <address>
            {pedido.nome}
            {endereco.map((l) => (
              <>
                <br />
                {l}
              </>
            ))}
          </address>
        </div>

        <aside class="resumo-pedido" aria-labelledby="titulo-itens">
          <h2 id="titulo-itens">Itens do pedido</h2>
          <ul class="linhas">
            {p.itens.map((i) => (
              <li>
                <span>
                  {i.quantidade}x {i.descricao}
                </span>
                <span>{dinheiro(i.quantidade * i.valor_unitario)}</span>
              </li>
            ))}
            <li>
              <span>Subtotal</span>
              <span>{dinheiro(pedido.subtotal)}</span>
            </li>
            <li>
              <span>Entrega</span>
              <span>{pedido.frete === 0 ? "Grátis" : dinheiro(pedido.frete)}</span>
            </li>
            <li class="total">
              <span>Total</span>
              <span>{dinheiro(pedido.total)}</span>
            </li>
          </ul>
          {p.novo ? (
            <p>
              <a href="/pedidos">Ver todos os meus pedidos</a>
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}

export function PaginaPedidos(p: {
  pedidos: { pedido: Pedido; nota: Nota | null }[];
  busca?: { codigo: string; email: string; erro?: string };
}) {
  const b = p.busca ?? { codigo: "", email: "" };
  return (
    <>
      <h1>Meus pedidos</h1>
      {p.pedidos.length === 0 ? (
        <div class="vazio">
          <p>Você ainda não fez pedidos neste navegador.</p>
          <p>
            <a class="botao" href="/">
              Ver produtos
            </a>
          </p>
        </div>
      ) : (
        <ul class="lista-pedidos" aria-label="Pedidos">
          {p.pedidos.map(({ pedido, nota }) => {
            const msg = mensagemNota(nota);
            return (
              <li>
                <article aria-labelledby={`pedido-${pedido.codigo}`}>
                  <h2 id={`pedido-${pedido.codigo}`}>
                    <a href={`/pedido/${pedido.codigo}`}>Pedido {pedido.codigo}</a>
                  </h2>
                  <p>
                    Feito em {dataCurta(pedido.criado_em)}, total de {dinheiro(pedido.total)}. Previsão de entrega até{" "}
                    {previsaoEntrega(pedido)}.
                  </p>
                  <p>
                    <span class={`situacao ${msg.pronta ? "ok" : "espera"}`}>{msg.resumo}</span>
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="titulo-busca">
        <h2 id="titulo-busca">Encontrar um pedido feito em outro aparelho</h2>
        {b.erro ? (
          <Aviso tipo="atencao" papel="alert">
            <p id="busca-erro">{b.erro}</p>
          </Aviso>
        ) : null}
        <form method="post" action="/pedidos/buscar" class="compra" novalidate>
          <div class="grade">
            <div class="campo">
              <label for="busca-codigo">Número do pedido</label>
              <input
                id="busca-codigo"
                name="codigo"
                type="text"
                inputmode="numeric"
                value={b.codigo}
                required
                aria-describedby={b.erro ? "busca-erro" : undefined}
                aria-invalid={b.erro ? "true" : undefined}
              />
            </div>
            <div class="campo">
              <label for="busca-email">E-mail usado na compra</label>
              <input
                id="busca-email"
                name="email"
                type="email"
                autocomplete="email"
                value={b.email}
                required
                aria-describedby={b.erro ? "busca-erro" : undefined}
                aria-invalid={b.erro ? "true" : undefined}
              />
            </div>
          </div>
          <button class="botao" type="submit">
            Encontrar pedido
          </button>
        </form>
      </section>
    </>
  );
}
