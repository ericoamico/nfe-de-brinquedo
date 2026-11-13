import { dinheiro, PRODUTOS, type Produto } from "../catalogo";

function Ilustracao({ p }: { p: Produto }) {
  return (
    <div class="ilustracao" style={`background:${p.cor}`} aria-hidden="true">
      {p.icone}
    </div>
  );
}

export const parcelamento = (centavos: number) => {
  const vezes = centavos >= 30000 ? 6 : centavos >= 10000 ? 3 : 1;
  return vezes > 1 ? `ou ${vezes}x de ${dinheiro(Math.ceil(centavos / vezes))} sem juros` : "à vista no Pix, boleto ou cartão";
};

export function Vitrine() {
  return (
    <>
      <section class="chamada" aria-labelledby="titulo-vitrine">
        <h1 id="titulo-vitrine">Produtos</h1>
        <p>Coisas boas para a casa, o trabalho e o dia a dia. Parcele em até 6x sem juros no cartão.</p>
      </section>
      <ul class="vitrine" aria-label="Lista de produtos">
        {PRODUTOS.map((p) => (
          <li>
            <article class="card" aria-labelledby={`nome-${p.id}`}>
              <Ilustracao p={p} />
              <div class="corpo">
                <h2 id={`nome-${p.id}`}>
                  <a href={`/produto/${p.id}`}>{p.nome}</a>
                </h2>
                <p class="categoria">{p.categoria}</p>
                <p class="resumo">{p.resumo}</p>
                <p class="preco">{dinheiro(p.preco)}</p>
                <p class="parcelas">{parcelamento(p.preco)}</p>
                <form method="post" action="/carrinho/adicionar">
                  <input type="hidden" name="produto" value={p.id} />
                  <input type="hidden" name="quantidade" value="1" />
                  <button class="botao largo" type="submit">
                    Adicionar <span class="vh">{p.nome} </span>ao carrinho
                  </button>
                </form>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PaginaProduto({ p }: { p: Produto }) {
  return (
    <>
      <nav class="migalhas" aria-label="Você está em">
        <ol>
          <li>
            <a href="/">Produtos</a>
          </li>
          <li>{p.categoria}</li>
          <li>
            <span aria-current="page">{p.nome}</span>
          </li>
        </ol>
      </nav>
      <div class="produto">
        <Ilustracao p={p} />
        <div>
          <h1>{p.nome}</h1>
          <p class="resumo">{p.resumo}</p>
          <div class="compra">
            <p class="preco">{dinheiro(p.preco)}</p>
            <p class="parcelas">{parcelamento(p.preco)}</p>
            <form method="post" action="/carrinho/adicionar">
              <input type="hidden" name="produto" value={p.id} />
              <div class="campo">
                <label for="quantidade">Quantidade</label>
                <select id="quantidade" name="quantidade" class="qtd">
                  {Array.from({ length: 10 }, (_, i) => (
                    <option value={String(i + 1)}>{i + 1}</option>
                  ))}
                </select>
              </div>
              <button class="botao destaque" type="submit">
                Adicionar ao carrinho
              </button>
            </form>
          </div>
          <h2>Descrição</h2>
          {p.descricao.map((t) => (
            <p>{t}</p>
          ))}
          <h2>Características</h2>
          <ul>
            {p.detalhes.map((d) => (
              <li>{d}</li>
            ))}
          </ul>
          <h2>Entrega</h2>
          <p>Entrega econômica em 5 a 8 dias úteis, grátis a partir de R$ 299,00, ou expressa em 1 a 3 dias úteis.</p>
        </div>
      </div>
    </>
  );
}

export function NaoEncontrada() {
  return (
    <>
      <h1>Página não encontrada</h1>
      <p>Não encontramos o que você procurava. Talvez o produto tenha saído do catálogo.</p>
      <p>
        <a href="/">Voltar para os produtos</a>
      </p>
    </>
  );
}
