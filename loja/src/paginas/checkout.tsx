import { dinheiro, ENTREGAS, type TipoEntrega, UFS, valorFrete } from "../catalogo";
import { type DadosCheckout, type Erros, ORDEM_CAMPOS } from "../checkout";
import type { LinhaCarrinho } from "./carrinho";

interface PropsCampo {
  id: keyof DadosCheckout;
  rotulo: string;
  d: DadosCheckout;
  e: Erros;
  tipo?: string;
  autocomplete?: string;
  dica?: string;
  opcional?: boolean;
  inputmode?: string;
  maxlength?: number;
}

function Campo(p: PropsCampo) {
  const erro = p.e[p.id];
  const descritores = [p.dica ? `${p.id}-dica` : "", erro ? `${p.id}-erro` : ""].filter(Boolean).join(" ");
  return (
    <div class="campo">
      <label for={p.id}>
        {p.rotulo}
        {p.opcional ? " (opcional)" : ""}
      </label>
      {p.dica ? (
        <span id={`${p.id}-dica`} class="dica">
          {p.dica}
        </span>
      ) : null}
      <input
        id={p.id}
        name={p.id}
        type={p.tipo ?? "text"}
        value={p.d[p.id]}
        autocomplete={p.autocomplete}
        inputmode={p.inputmode as any}
        maxlength={p.maxlength ?? 120}
        required={!p.opcional}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={descritores || undefined}
      />
      {erro ? (
        <span id={`${p.id}-erro`} class="erro-campo">
          {erro}
        </span>
      ) : null}
    </div>
  );
}

const ROTULOS: Record<keyof DadosCheckout, string> = {
  nome: "Nome completo", email: "E-mail", cpf: "CPF", telefone: "Telefone", cep: "CEP", logradouro: "Endereço",
  numero: "Número", complemento: "Complemento", bairro: "Bairro", cidade: "Cidade", uf: "Estado",
  entrega: "Entrega", pagamento: "Forma de pagamento", parcelas: "Parcelas",
};

function ResumoErros({ e }: { e: Erros }) {
  const campos = ORDEM_CAMPOS.filter((k) => e[k]);
  if (!campos.length) return null;
  return (
    <div class="aviso atencao" role="alert" aria-labelledby="titulo-erros">
      <h2 id="titulo-erros">
        {campos.length === 1 ? "Falta corrigir 1 campo" : `Falta corrigir ${campos.length} campos`} para concluir a
        compra
      </h2>
      <ul>
        {campos.map((k) => (
          <li>
            <a href={`#${k === "entrega" ? "entrega-economica" : k === "pagamento" ? "pagamento-pix" : k}`}>
              {ROTULOS[k]}: {e[k]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Opcao(p: { nome: string; valor: string; atual: string; rotulo: string; dica: string; erro?: boolean }) {
  const id = `${p.nome}-${p.valor}`;
  return (
    <div class="opcao">
      <input
        type="radio"
        id={id}
        name={p.nome}
        value={p.valor}
        checked={p.atual === p.valor}
        aria-describedby={`${id}-dica`}
        aria-invalid={p.erro ? "true" : undefined}
      />
      <label for={id}>
        {p.rotulo}
        <span id={`${id}-dica`} class="dica">
          {p.dica}
        </span>
      </label>
    </div>
  );
}

export function PaginaCheckout(p: { d: DadosCheckout; e: Erros; linhas: LinhaCarrinho[]; subtotal: number }) {
  const { d, e } = p;
  const frete = (t: TipoEntrega) => valorFrete(t, p.subtotal);
  const textoFrete = (t: TipoEntrega) => (frete(t) === 0 ? "grátis" : dinheiro(frete(t)));
  return (
    <>
      <h1>Finalizar compra</h1>
      <ResumoErros e={e} />
      <div class="colunas">
        <form method="post" action="/finalizar" novalidate>
          <p>Todos os campos são obrigatórios, exceto os marcados como opcionais.</p>
          <fieldset>
            <legend>Seus dados</legend>
            <Campo id="nome" rotulo="Nome completo" d={d} e={e} autocomplete="name" />
            <Campo
              id="email"
              rotulo="E-mail"
              d={d}
              e={e}
              tipo="email"
              autocomplete="email"
              dica="A nota fiscal e as atualizações do pedido chegam neste e-mail."
            />
            <div class="grade">
              <Campo
                id="cpf"
                rotulo="CPF"
                d={d}
                e={e}
                inputmode="numeric"
                maxlength={14}
                dica="Necessário para emitir a nota fiscal."
              />
              <Campo id="telefone" rotulo="Telefone" d={d} e={e} tipo="tel" autocomplete="tel" dica="Com DDD." />
            </div>
          </fieldset>

          <fieldset>
            <legend>Endereço de entrega</legend>
            <Campo id="cep" rotulo="CEP" d={d} e={e} autocomplete="postal-code" inputmode="numeric" maxlength={9} />
            <Campo id="logradouro" rotulo="Endereço" d={d} e={e} autocomplete="address-line1" dica="Rua, avenida ou travessa." />
            <div class="grade">
              <Campo id="numero" rotulo="Número" d={d} e={e} maxlength={10} />
              <Campo id="complemento" rotulo="Complemento" d={d} e={e} autocomplete="address-line2" opcional />
            </div>
            <Campo id="bairro" rotulo="Bairro" d={d} e={e} />
            <div class="grade">
              <Campo id="cidade" rotulo="Cidade" d={d} e={e} autocomplete="address-level2" />
              <div class="campo">
                <label for="uf">Estado</label>
                <select
                  id="uf"
                  name="uf"
                  autocomplete="address-level1"
                  required
                  aria-invalid={e.uf ? "true" : undefined}
                  aria-describedby={e.uf ? "uf-erro" : undefined}
                >
                  <option value="">Escolha o estado</option>
                  {UFS.map(([sigla, nome]) => (
                    <option value={sigla} selected={d.uf === sigla}>
                      {nome}
                    </option>
                  ))}
                </select>
                {e.uf ? (
                  <span id="uf-erro" class="erro-campo">
                    {e.uf}
                  </span>
                ) : null}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Entrega</legend>
            {(Object.keys(ENTREGAS) as TipoEntrega[]).map((t) => (
              <Opcao
                nome="entrega"
                valor={t}
                atual={d.entrega}
                rotulo={`${ENTREGAS[t].nome}: ${textoFrete(t)}`}
                dica={`Chega em ${ENTREGAS[t].prazo} após a confirmação do pagamento.`}
                erro={!!e.entrega}
              />
            ))}
          </fieldset>

          <fieldset>
            <legend>Pagamento</legend>
            <p class="dica">Pagamento simulado: nenhum valor é cobrado e não pedimos dados de cartão.</p>
            <Opcao
              nome="pagamento"
              valor="pix"
              atual={d.pagamento}
              rotulo="Pix"
              dica="Aprovação na hora."
              erro={!!e.pagamento}
            />
            <Opcao
              nome="pagamento"
              valor="boleto"
              atual={d.pagamento}
              rotulo="Boleto bancário"
              dica="Compensação simulada na hora."
              erro={!!e.pagamento}
            />
            <Opcao
              nome="pagamento"
              valor="cartao"
              atual={d.pagamento}
              rotulo="Cartão de crédito"
              dica="Em até 6 vezes sem juros."
              erro={!!e.pagamento}
            />
            <div class="campo">
              <label for="parcelas">Parcelas no cartão de crédito</label>
              <select
                id="parcelas"
                name="parcelas"
                class="qtd"
                aria-describedby={e.parcelas ? "parcelas-dica parcelas-erro" : "parcelas-dica"}
                aria-invalid={e.parcelas ? "true" : undefined}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={String(n)} selected={d.parcelas === String(n)}>
                    {n}x
                  </option>
                ))}
              </select>
              <span id="parcelas-dica" class="dica">
                Só vale se você escolher cartão de crédito.
              </span>
              {e.parcelas ? (
                <span id="parcelas-erro" class="erro-campo">
                  {e.parcelas}
                </span>
              ) : null}
            </div>
          </fieldset>

          <button class="botao destaque largo" type="submit">
            Confirmar pedido
          </button>
        </form>

        <aside class="resumo-pedido" aria-labelledby="titulo-resumo">
          <h2 id="titulo-resumo">Resumo do pedido</h2>
          <ul class="linhas">
            {p.linhas.map((l) => (
              <li>
                <span>
                  {l.quantidade}x {l.produto.nome}
                </span>
                <span>{dinheiro(l.subtotal)}</span>
              </li>
            ))}
            <li>
              <span>Subtotal</span>
              <span>{dinheiro(p.subtotal)}</span>
            </li>
          </ul>
          <h3>Total com a entrega</h3>
          <ul class="linhas">
            {(Object.keys(ENTREGAS) as TipoEntrega[]).map((t) => (
              <li>
                <span>{ENTREGAS[t].nome}</span>
                <span>{dinheiro(p.subtotal + frete(t))}</span>
              </li>
            ))}
          </ul>
          <p>
            <a href="/carrinho">Alterar o carrinho</a>
          </p>
        </aside>
      </div>
    </>
  );
}
