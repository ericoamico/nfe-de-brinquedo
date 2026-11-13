import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { soDigitos } from "../../comum/documentos";
import type { Log } from "../../comum/log";
import type { BancoLoja, Pedido } from "./banco";
import { PRODUTOS, produtoPorId, valorFrete } from "./catalogo";
import { entregaValida, lerFormulario, ORDEM_CAMPOS, validar, vazio } from "./checkout";
import type { ConfigLoja } from "./config";
import type { Emissor } from "./nfe/emissor";
import { type LinhaCarrinho, PaginaCarrinho } from "./paginas/carrinho";
import { PaginaCheckout } from "./paginas/checkout";
import { ESTILO } from "./paginas/estilo";
import { renderizar, type Secao } from "./paginas/layout";
import { PaginaPedido, PaginaPedidos } from "./paginas/pedidos";
import { NaoEncontrada, PaginaProduto, Vitrine } from "./paginas/vitrine";

export interface DependenciasLoja {
  config: ConfigLoja;
  banco: BancoLoja;
  emissor: Emissor;
  log: Log;
  /** Gera o DANFE (PDF) a partir do nfeProc. */
  gerarDanfe?: (xmlProc: string) => Promise<Uint8Array>;
}

type Ambiente = { Variables: { sessao: string } };

const UUID = /^[0-9a-f-]{36}$/;

export function criarAppLoja(deps: DependenciasLoja): Hono<Ambiente> {
  const { config, banco, emissor, log } = deps;
  const app = new Hono<Ambiente>();

  app.use("*", bodyLimit({ maxSize: 64 * 1024 }));

  // Sessão anônima por cookie (carrinho e "meus pedidos").
  app.use("*", async (c, next) => {
    let sessao = getCookie(c, "sessao");
    if (!sessao || !UUID.test(sessao)) {
      sessao = crypto.randomUUID();
      setCookie(c, "sessao", sessao, {
        httpOnly: true,
        sameSite: "Lax",
        secure: config.cookieSeguro,
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      });
    }
    c.set("sessao", sessao);
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
  });

  const carrinho = (sessao: string) => {
    const linhas: LinhaCarrinho[] = [];
    for (const i of banco.itensCarrinho(sessao)) {
      const produto = produtoPorId(i.produto);
      if (produto) linhas.push({ produto, quantidade: i.quantidade, subtotal: produto.preco * i.quantidade });
    }
    return { linhas, subtotal: linhas.reduce((s, l) => s + l.subtotal, 0), itens: linhas.reduce((s, l) => s + l.quantidade, 0) };
  };

  const pagina = (sessao: string, titulo: string, secao: Secao, conteudo: any) =>
    renderizar({ titulo, secao, itensNoCarrinho: carrinho(sessao).itens, cnpj: config.emitente.cnpj }, conteudo);

  const naoEncontrada = (c: any) =>
    c.html(pagina(c.get("sessao"), "Página não encontrada", "outra", <NaoEncontrada />), 404);

  app.get("/estilo.css", (c) =>
    c.body(ESTILO, 200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" }),
  );
  app.get("/saude", (c) => c.json({ ok: true }));

  // Vitrine e produto ---------------------------------------------------------
  app.get("/", (c) => c.html(pagina(c.get("sessao"), "Produtos", "vitrine", <Vitrine />)));

  app.get("/produto/:id", (c) => {
    const p = produtoPorId(c.req.param("id"));
    if (!p) return naoEncontrada(c);
    return c.html(pagina(c.get("sessao"), p.nome, "outra", <PaginaProduto p={p} />));
  });

  // Carrinho ------------------------------------------------------------------
  app.post("/carrinho/adicionar", async (c) => {
    const form = await c.req.parseBody();
    const p = produtoPorId(String(form.produto ?? ""));
    if (!p) return naoEncontrada(c);
    const qtd = Math.min(Math.max(Math.trunc(Number(form.quantidade) || 1), 1), 10);
    banco.adicionarAoCarrinho(c.get("sessao"), p.id, qtd);
    return c.redirect(`/carrinho?aviso=adicionado&produto=${p.id}`, 303);
  });

  app.post("/carrinho/atualizar", async (c) => {
    const form = await c.req.parseBody();
    const p = produtoPorId(String(form.produto ?? ""));
    if (!p) return c.redirect("/carrinho", 303);
    const qtd = Math.min(Math.max(Math.trunc(Number(form.quantidade)) || 0, 0), 10);
    banco.definirQuantidade(c.get("sessao"), p.id, qtd);
    return c.redirect(`/carrinho?aviso=${qtd === 0 ? "removido" : "atualizado"}&produto=${p.id}`, 303);
  });

  app.get("/carrinho", (c) => {
    const sessao = c.get("sessao");
    const { linhas, subtotal } = carrinho(sessao);
    const nome = produtoPorId(c.req.query("produto") ?? "")?.nome;
    const aviso = nome
      ? ({
          adicionado: `${nome} foi adicionado ao carrinho.`,
          atualizado: `Quantidade de ${nome} atualizada.`,
          removido: `${nome} foi removido do carrinho.`,
        } as Record<string, string>)[c.req.query("aviso") ?? ""]
      : undefined;
    const titulo = aviso ? `${aviso} Carrinho` : "Carrinho";
    return c.html(pagina(sessao, titulo, "carrinho", <PaginaCarrinho linhas={linhas} subtotal={subtotal} aviso={aviso} />));
  });

  // Checkout ------------------------------------------------------------------
  app.get("/finalizar", (c) => {
    const sessao = c.get("sessao");
    const { linhas, subtotal } = carrinho(sessao);
    if (!linhas.length) return c.redirect("/carrinho", 303);
    return c.html(
      pagina(sessao, "Finalizar compra", "checkout", <PaginaCheckout d={vazio()} e={{}} linhas={linhas} subtotal={subtotal} />),
    );
  });

  app.post("/finalizar", async (c) => {
    const sessao = c.get("sessao");
    const { linhas, subtotal } = carrinho(sessao);
    if (!linhas.length) return c.redirect("/carrinho", 303);
    const d = lerFormulario(await c.req.parseBody());
    const erros = validar(d);
    const qtdErros = ORDEM_CAMPOS.filter((k) => erros[k]).length;
    if (qtdErros || !entregaValida(d.entrega)) {
      const titulo = `Erro: falta corrigir ${qtdErros === 1 ? "1 campo" : `${qtdErros} campos`}. Finalizar compra`;
      return c.html(
        pagina(sessao, titulo, "checkout", <PaginaCheckout d={d} e={erros} linhas={linhas} subtotal={subtotal} />),
        422,
      );
    }

    const frete = valorFrete(d.entrega, subtotal);
    const criar = banco.db.transaction(() => {
      const r = banco.inserirPedido(
        {
          sessao,
          nome: d.nome,
          email: d.email,
          cpf: soDigitos(d.cpf),
          telefone: soDigitos(d.telefone),
          cep: soDigitos(d.cep),
          logradouro: d.logradouro,
          numero: d.numero,
          complemento: d.complemento,
          bairro: d.bairro,
          cidade: d.cidade,
          uf: d.uf,
          entrega: d.entrega as Pedido["entrega"],
          frete,
          pagamento: d.pagamento as Pedido["pagamento"],
          parcelas: d.pagamento === "cartao" ? Number(d.parcelas) : 1,
          subtotal,
          total: subtotal + frete,
        },
        linhas.map((l) => ({
          produto: l.produto.id,
          codigo: l.produto.codigo,
          descricao: l.produto.nome,
          ncm: l.produto.ncm,
          quantidade: l.quantidade,
          valor_unitario: l.produto.preco,
        })),
      );
      emissor.criarNota(r.id);
      banco.esvaziarCarrinho(sessao);
      return r;
    });
    const { id, codigo } = criar();
    log.info("pedido.criado", { pedido: codigo, total: subtotal + frete, pagamento: d.pagamento });

    // Espera a nota por um tempo razoável; se demorar, ela continua em segundo plano.
    const emissao = emissor.emitir(id).catch((e) => log.erro("pedido.emissao_falhou", { pedido: codigo, erro: String(e) }));
    await Promise.race([emissao, new Promise((r) => setTimeout(r, config.esperaCheckoutMs))]);
    return c.redirect(`/pedido/${codigo}?novo=1`, 303);
  });

  // Pedidos -------------------------------------------------------------------
  const pedidoVisivel = (c: any) => {
    const pedido = banco.pedidoPorCodigo(c.req.param("codigo"));
    return pedido && banco.podeVerPedido(c.get("sessao"), pedido) ? pedido : null;
  };

  app.get("/pedido/:codigo", (c) => {
    const pedido = pedidoVisivel(c);
    if (!pedido) return naoEncontrada(c);
    const novo = c.req.query("novo") === "1";
    const nota = banco.nota(pedido.id);
    return c.html(
      pagina(
        c.get("sessao"),
        novo ? `Pedido ${pedido.codigo} confirmado` : `Pedido ${pedido.codigo}`,
        "pedidos",
        <PaginaPedido pedido={pedido} itens={banco.itensPedido(pedido.id)} nota={nota} novo={novo} urlConsulta={config.urlConsulta} />,
      ),
    );
  });

  app.get("/pedido/:codigo/nota-fiscal.xml", (c) => {
    const pedido = pedidoVisivel(c);
    const nota = pedido && banco.nota(pedido.id);
    if (!pedido || !nota?.xml_proc) return naoEncontrada(c);
    return c.body(nota.xml_proc, 200, {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="nota-fiscal-${nota.numero}.xml"`,
    });
  });

  app.get("/pedido/:codigo/nota-fiscal.pdf", async (c) => {
    const pedido = pedidoVisivel(c);
    const nota = pedido && banco.nota(pedido.id);
    if (!pedido || !nota?.xml_proc || !deps.gerarDanfe) return naoEncontrada(c);
    const pdf = await deps.gerarDanfe(nota.xml_proc);
    return c.body(pdf as any, 200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="nota-fiscal-${nota.numero}.pdf"`,
    });
  });

  const listaPedidos = (sessao: string) =>
    banco.pedidosDaSessao(sessao).map((pedido) => ({ pedido, nota: banco.nota(pedido.id) }));

  app.get("/pedidos", (c) => {
    const sessao = c.get("sessao");
    return c.html(pagina(sessao, "Meus pedidos", "pedidos", <PaginaPedidos pedidos={listaPedidos(sessao)} />));
  });

  app.post("/pedidos/buscar", async (c) => {
    const sessao = c.get("sessao");
    const form = await c.req.parseBody();
    const codigo = soDigitos(String(form.codigo ?? ""));
    const email = String(form.email ?? "").trim();
    const pedido = codigo ? banco.pedidoPorCodigo(codigo) : null;
    if (!pedido || pedido.email.toLowerCase() !== email.toLowerCase()) {
      const erro = "Não encontramos um pedido com esse número e esse e-mail. Confira os dados e tente de novo.";
      return c.html(
        pagina(
          sessao,
          "Erro: pedido não encontrado. Meus pedidos",
          "pedidos",
          <PaginaPedidos pedidos={listaPedidos(sessao)} busca={{ codigo, email, erro }} />,
        ),
        404,
      );
    }
    banco.liberarAcesso(sessao, pedido.id);
    return c.redirect(`/pedido/${pedido.codigo}`, 303);
  });

  app.notFound((c) => naoEncontrada(c));
  app.onError((e, c) => {
    log.erro("http.erro", { caminho: c.req.path, erro: e.stack });
    return c.html(
      pagina(
        c.get("sessao") ?? "",
        "Algo deu errado",
        "outra",
        <>
          <h1>Algo deu errado</h1>
          <p>Não foi possível carregar esta página agora. Tente de novo em alguns instantes.</p>
          <p>
            <a href="/">Voltar para os produtos</a>
          </p>
        </>,
      ),
      500,
    );
  });

  return app;
}

export { PRODUTOS };
