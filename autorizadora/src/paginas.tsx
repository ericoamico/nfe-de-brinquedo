import { raw } from "hono/html";
import { formatarChave, chaveValida } from "../../comum/chave";
import { formatarCNPJ, mascararCPF, soDigitos } from "../../comum/documentos";
import type { NotaAutorizada } from "./banco";
import type { Contexto } from "./servicos";

const CSS = `
:root{--fundo:#f6f4ee;--papel:#fff;--tinta:#1d2a2a;--suave:#4c5b5b;--marca:#0f5c55;--acento:#b4441f;--ok:#1d6b3a;--borda:#cfd6d2;--foco:#c2410c}
@media (prefers-color-scheme:dark){:root{--fundo:#121817;--papel:#1b2423;--tinta:#e9efed;--suave:#b6c3c0;--marca:#7fd1c4;--acento:#ffab8a;--ok:#86d49c;--borda:#33413f;--foco:#ffab8a}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif}
a{color:var(--marca)}
:focus-visible{outline:3px solid var(--foco);outline-offset:2px}
.pular{position:absolute;left:-9999px;top:0}
.pular:focus{left:1rem;top:1rem;background:var(--papel);padding:.5rem 1rem;z-index:10}
header{background:var(--marca);color:#fff}
@media (prefers-color-scheme:dark){header{color:#0b1312}}
.topo{max-width:46rem;margin:0 auto;padding:1rem;display:flex;align-items:center;gap:.75rem}
.selo{width:2.25rem;height:2.25rem;border-radius:50%;border:3px solid currentColor;display:grid;place-items:center;font-weight:800}
.marca{font-size:1.25rem;font-weight:800;letter-spacing:.02em;margin:0}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.75rem;line-height:1.25;margin:.5rem 0 1rem}
h2{font-size:1.3rem;margin:2rem 0 .75rem}
.cartao{background:var(--papel);border:1px solid var(--borda);border-radius:14px;padding:1.25rem 1.25rem 1.5rem}
label{display:block;font-weight:700;margin-bottom:.35rem}
input{width:100%;font:inherit;padding:.7rem .8rem;border:2px solid var(--borda);border-radius:10px;background:var(--papel);color:var(--tinta);letter-spacing:.04em}
input[aria-invalid=true]{border-color:var(--acento)}
.ajuda{color:var(--suave);margin:.35rem 0 1rem;font-size:.95rem}
.erro{color:var(--acento);font-weight:700;margin:.35rem 0 0}
button{font:inherit;font-weight:700;background:var(--marca);color:#fff;border:0;border-radius:10px;padding:.7rem 1.4rem;cursor:pointer}
@media (prefers-color-scheme:dark){button{color:#0b1312}}
.situacao{display:inline-block;font-weight:800;padding:.2rem .7rem;border-radius:999px;border:2px solid currentColor}
.situacao.ok{color:var(--ok)}
.situacao.alerta{color:var(--acento)}
dl{display:grid;grid-template-columns:minmax(9rem,max-content) 1fr;gap:.4rem 1rem;margin:1rem 0 0}
dt{font-weight:700;color:var(--suave)}
dd{margin:0;overflow-wrap:anywhere}
@media (max-width:30rem){dl{grid-template-columns:1fr}dd{margin-bottom:.5rem}}
footer{max-width:46rem;margin:0 auto;padding:1rem 1rem 2rem;color:var(--suave);font-size:.9rem;border-top:1px solid var(--borda)}
`;

const dinheiro = (v: string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dataLegivel(dh: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dh);
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : dh;
}

type Situacao =
  | { tipo: "vazia" }
  | { tipo: "invalida"; chave: string }
  | { tipo: "nao-encontrada"; chave: string }
  | { tipo: "autorizada"; nota: NotaAutorizada };

function Layout(props: { titulo: string; children: any }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.titulo}</title>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        <a class="pular" href="#conteudo">Pular para o conteúdo</a>
        <header>
          <div class="topo">
            <span class="selo" aria-hidden="true">R</span>
            <p class="marca">Receita de Brinquedo</p>
          </div>
        </header>
        <main id="conteudo">{props.children}</main>
        <footer>
          <p>
            Receita de Brinquedo é um serviço fictício, criado para estudo. As notas consultadas aqui são de
            brinquedo e não têm valor fiscal.
          </p>
        </footer>
      </body>
    </html>
  );
}

function Formulario(props: { valor: string; erro?: string; titulo: string; nivel: 1 | 2 }) {
  const Titulo = props.nivel === 1 ? "h1" : "h2";
  const descrito = props.erro ? "chave-ajuda chave-erro" : "chave-ajuda";
  return (
    <div>
      <Titulo id="titulo-form">{props.titulo}</Titulo>
      <form class="cartao" method="get" action="/consulta" role="search" aria-labelledby="titulo-form">
        <label for="chave">Chave de acesso</label>
        <input
          id="chave"
          name="chave"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck={false}
          value={props.valor}
          aria-describedby={descrito}
          aria-invalid={props.erro ? "true" : undefined}
          required
        />
        <p id="chave-ajuda" class="ajuda">
          São 44 números, impressos perto do código de barras da nota. Pode digitar ou colar com ou sem espaços.
        </p>
        {props.erro ? (
          <p id="chave-erro" class="erro">
            {props.erro}
          </p>
        ) : null}
        <button type="submit">Consultar</button>
      </form>
    </div>
  );
}

function Resultado({ s }: { s: Situacao }) {
  if (s.tipo === "autorizada") {
    const n = s.nota;
    return (
      <section aria-labelledby="titulo-resultado">
        <h1 id="titulo-resultado">Resultado da consulta</h1>
        <div class="cartao">
          <p>
            <span class="situacao ok">Nota fiscal autorizada</span>
          </p>
          <dl>
            <dt>Emitente</dt>
            <dd>{n.emitente}</dd>
            <dt>CNPJ do emitente</dt>
            <dd>{formatarCNPJ(n.cnpj)}</dd>
            <dt>Número e série</dt>
            <dd>
              Nota {n.numero}, série {n.serie}
            </dd>
            <dt>Emitida em</dt>
            <dd>{dataLegivel(n.dh_emi)}</dd>
            <dt>Valor total</dt>
            <dd>{dinheiro(n.valor)}</dd>
            <dt>Destinatário</dt>
            <dd>
              {n.destinatario}, CPF {mascararCPF(n.cpf_dest)}
            </dd>
            <dt>Protocolo de autorização</dt>
            <dd>{n.nprot}</dd>
            <dt>Autorizada em</dt>
            <dd>{dataLegivel(n.dh_recbto)}</dd>
            <dt>Chave de acesso</dt>
            <dd>{formatarChave(n.chave)}</dd>
          </dl>
        </div>
      </section>
    );
  }
  if (s.tipo === "nao-encontrada") {
    return (
      <section aria-labelledby="titulo-resultado">
        <h1 id="titulo-resultado">Resultado da consulta</h1>
        <div class="cartao">
          <p>
            <span class="situacao alerta">Nota fiscal não encontrada</span>
          </p>
          <p>
            Não encontramos nenhuma nota autorizada com a chave {formatarChave(s.chave)}. Confira se digitou todos os
            números. Se a compra foi feita há poucos minutos, tente de novo daqui a pouco.
          </p>
        </div>
      </section>
    );
  }
  return null;
}

export function paginaConsulta(p: { ctx: Contexto; chave?: string; naoEncontrada?: boolean }): string {
  return "<!DOCTYPE html>" + String(conteudoConsulta(p));
}

function conteudoConsulta(p: { ctx: Contexto; chave?: string; naoEncontrada?: boolean }) {
  if (p.naoEncontrada) {
    return (
      <Layout titulo="Página não encontrada - Receita de Brinquedo">
        <h1>Página não encontrada</h1>
        <p>
          O endereço acessado não existe. <a href="/">Ir para a consulta de notas fiscais</a>.
        </p>
      </Layout>
    );
  }
  const digitada = (p.chave ?? "").trim();
  const chave = soDigitos(digitada);
  let s: Situacao = { tipo: "vazia" };
  if (digitada) {
    if (chave.length !== 44 || !chaveValida(chave)) s = { tipo: "invalida", chave };
    else {
      const nota = p.ctx.banco.notaPorChave(chave);
      s = nota ? { tipo: "autorizada", nota } : { tipo: "nao-encontrada", chave };
    }
  }

  if (s.tipo === "vazia") {
    return (
      <Layout titulo="Consultar nota fiscal - Receita de Brinquedo">
        <Formulario titulo="Consultar nota fiscal" nivel={1} valor="" />
      </Layout>
    );
  }
  if (s.tipo === "invalida") {
    const erro =
      chave.length !== 44
        ? `A chave precisa ter 44 números e a informada tem ${chave.length}. Confira e tente de novo.`
        : "Essa chave não é válida: algum número foi digitado errado. Confira e tente de novo.";
    return (
      <Layout titulo="Erro: chave de acesso inválida - Receita de Brinquedo">
        <Formulario titulo="Consultar nota fiscal" nivel={1} valor={digitada} erro={erro} />
      </Layout>
    );
  }
  const titulo = s.tipo === "autorizada" ? "Nota fiscal autorizada" : "Nota fiscal não encontrada";
  return (
    <Layout titulo={`${titulo} - Receita de Brinquedo`}>
      <Resultado s={s} />
      <Formulario titulo="Consultar outra nota" nivel={2} valor="" />
    </Layout>
  );
}
