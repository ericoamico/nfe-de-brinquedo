import { dinheiro, ENTREGAS, type Produto } from "../catalogo";

export interface LinhaCarrinho {
  produto: Produto;
  quantidade: number;
  subtotal: number;
}

export function Aviso(p: { tipo: "sucesso" | "atencao"; children: any; papel?: "status" | "alert" }) {
  return (
    <div class={`aviso ${p.tipo}`} role={p.papel ?? "status"}>
      {p.children}
    </div>
  );
}

export function PaginaCarrinho(p: { linhas: LinhaCarrinho[]; subtotal: number; aviso?: string }) {
  const gratis = ENTREGAS.economica.gratisAcima!;
  return (
    <>
      <h1>Carrinho</h1>
      {p.aviso ? (
        <Aviso tipo="sucesso">
          <p>{p.aviso}</p>
        </Aviso>
      ) : null}
      {p.linhas.length === 0 ? (
        <div class="vazio">
          <p>Seu carrinho está vazio.</p>
          <p>
            <a class="botao" href="/">
              Ver produtos
            </a>
          </p>
        </div>
      ) : (
        <div class="colunas">
          <table class="responsiva">
            <caption>Produtos no carrinho</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col" class="num">
                  Preço
                </th>
                <th scope="col">Quantidade</th>
                <th scope="col" class="num">
                  Subtotal
                </th>
                <th scope="col">
                  <span class="vh">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.linhas.map((l) => (
                <tr>
                  <th scope="row">
                    <a href={`/produto/${l.produto.id}`}>{l.produto.nome}</a>
                  </th>
                  <td class="num" data-rotulo="Preço">
                    {dinheiro(l.produto.preco)}
                  </td>
                  <td data-rotulo="Quantidade">
                    <form method="post" action="/carrinho/atualizar" class="linha-acoes">
                      <input type="hidden" name="produto" value={l.produto.id} />
                      <label class="vh" for={`qtd-${l.produto.id}`}>
                        Quantidade de {l.produto.nome}
                      </label>
                      <input
                        class="qtd"
                        type="number"
                        id={`qtd-${l.produto.id}`}
                        name="quantidade"
                        min="0"
                        max="10"
                        value={String(l.quantidade)}
                        inputmode="numeric"
                      />
                      <button class="botao secundario pequeno" type="submit">
                        Atualizar <span class="vh">quantidade de {l.produto.nome}</span>
                      </button>
                    </form>
                  </td>
                  <td class="num" data-rotulo="Subtotal">
                    {dinheiro(l.subtotal)}
                  </td>
                  <td>
                    <form method="post" action="/carrinho/atualizar">
                      <input type="hidden" name="produto" value={l.produto.id} />
                      <input type="hidden" name="quantidade" value="0" />
                      <button class="botao secundario pequeno" type="submit">
                        Remover <span class="vh">{l.produto.nome}</span>
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <aside class="resumo-pedido" aria-labelledby="titulo-resumo">
            <h2 id="titulo-resumo">Resumo</h2>
            <ul class="linhas">
              <li>
                <span>Subtotal</span> <span>{dinheiro(p.subtotal)}</span>
              </li>
            </ul>
            <p>
              {p.subtotal >= gratis
                ? "Sua compra ganhou entrega econômica grátis."
                : `Faltam ${dinheiro(gratis - p.subtotal)} para ganhar entrega econômica grátis.`}
            </p>
            <p>A entrega é escolhida na próxima etapa.</p>
            <p>
              <a class="botao destaque largo" href="/finalizar">
                Continuar para entrega e pagamento
              </a>
            </p>
            <p>
              <a href="/">Continuar comprando</a>
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
