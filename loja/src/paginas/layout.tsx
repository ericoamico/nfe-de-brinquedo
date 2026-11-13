import type { Child } from "hono/jsx";
import { formatarCNPJ } from "../../../comum/documentos";

export type Secao = "vitrine" | "carrinho" | "pedidos" | "checkout" | "outra";

export interface PropsLayout {
  titulo: string;
  secao: Secao;
  itensNoCarrinho: number;
  cnpj: string;
  children: Child;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Layout(p: PropsLayout) {
  const atual = (s: Secao) => (p.secao === s ? "page" : undefined);
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${p.titulo} | Loja do Érico (fictícia)`}</title>
        <link rel="stylesheet" href="/estilo.css" />
      </head>
      <body>
        <a class="pular" href="#conteudo">
          Pular para o conteúdo
        </a>
        <p class="faixa">Entrega econômica grátis em compras a partir de R$ 299,00</p>
        <header class="cabecalho">
          <div class="interno">
            <a class="logo" href="/">
              <span class="marca" aria-hidden="true">
                É
              </span>
              <span>
                Loja do Érico <small>(fictícia)</small>
              </span>
            </a>
            <nav aria-label="Principal">
              <ul>
                <li>
                  <a href="/" aria-current={atual("vitrine")}>
                    Produtos
                  </a>
                </li>
                <li>
                  <a href="/pedidos" aria-current={atual("pedidos")}>
                    Meus pedidos
                  </a>
                </li>
                <li>
                  <a href="/carrinho" aria-current={atual("carrinho")}>
                    Carrinho
                    <span class="vh">, {plural(p.itensNoCarrinho, "item", "itens")}</span>
                    <span class="contador" aria-hidden="true">
                      {p.itensNoCarrinho}
                    </span>
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="conteudo" tabindex={-1}>
          {p.children}
        </main>
        <footer class="rodape">
          <div class="interno">
            <section aria-labelledby="rodape-loja">
              <h2 id="rodape-loja">Loja do Érico (fictícia)</h2>
              <p>CNPJ {formatarCNPJ(p.cnpj)}</p>
              <p>Rua dos Brinquedos, 100, Centro, Cidade de Brinquedo</p>
            </section>
            <section aria-labelledby="rodape-atendimento">
              <h2 id="rodape-atendimento">Atendimento</h2>
              <p>Segunda a sexta, das 9h às 18h</p>
              <p>
                <a href="/pedidos">Acompanhe seus pedidos</a>
              </p>
            </section>
            <section aria-labelledby="rodape-aviso">
              <h2 id="rodape-aviso">Loja fictícia</h2>
              <p>Nenhum produto é enviado e nenhum valor é cobrado. As notas fiscais emitidas não têm valor fiscal.</p>
            </section>
          </div>
        </footer>
      </body>
    </html>
  );
}

export function renderizar(props: Omit<PropsLayout, "children">, conteudo: Child): string {
  return "<!DOCTYPE html>" + String(<Layout {...props}>{conteudo}</Layout>);
}
