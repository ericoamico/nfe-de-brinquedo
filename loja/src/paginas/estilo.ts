export const ESTILO = `
:root{
  --fundo:#faf8f5;--papel:#ffffff;--tinta:#1e2329;--suave:#57606a;--borda:#dcd7cf;
  --primaria:#1d4f91;--primaria-tinta:#ffffff;--destaque:#b8461b;--sucesso:#1e6b3c;--alerta:#9a3412;
  --foco:#e2620f;--sombra:0 1px 2px rgba(0,0,0,.06),0 4px 14px rgba(0,0,0,.05);--raio:14px
}
@media (prefers-color-scheme:dark){:root{
  --fundo:#14171b;--papel:#1d2127;--tinta:#eceff3;--suave:#b3bcc6;--borda:#353b44;
  --primaria:#8bb8ff;--primaria-tinta:#0c1a2d;--destaque:#ffa47e;--sucesso:#86d49c;--alerta:#ffb38a;
  --foco:#ffb070;--sombra:none
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fundo);color:var(--tinta);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue",sans-serif}
a{color:var(--primaria);text-underline-offset:.15em}
:focus-visible{outline:3px solid var(--foco);outline-offset:3px;border-radius:4px}
img,svg{max-width:100%}
.vh{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pular{position:absolute;left:-9999px;top:.5rem;background:var(--papel);color:var(--tinta);padding:.6rem 1rem;border-radius:8px;z-index:20}
.pular:focus{left:.5rem}
.faixa{background:var(--tinta);color:var(--fundo);font-size:.9rem;text-align:center;padding:.35rem 1rem;margin:0}
.cabecalho{background:var(--papel);border-bottom:1px solid var(--borda)}
.cabecalho .interno{max-width:72rem;margin:0 auto;padding:.9rem 1rem;display:flex;flex-wrap:wrap;gap:.75rem 2rem;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:.6rem;font-weight:800;font-size:1.3rem;color:var(--tinta);text-decoration:none}
.logo .marca{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:10px;background:var(--primaria);color:var(--primaria-tinta);font-size:1.1rem}
.logo small{font-weight:500;color:var(--suave);font-size:.85rem}
nav ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1.25rem}
nav a{font-weight:600;text-decoration:none;padding:.3rem .1rem;border-bottom:3px solid transparent}
nav a:hover{border-bottom-color:var(--borda)}
nav a[aria-current=page]{border-bottom-color:var(--primaria)}
.contador{display:inline-block;min-width:1.5rem;padding:0 .4rem;margin-left:.2rem;border-radius:999px;background:var(--destaque);color:#fff;font-size:.85rem;text-align:center}
@media (prefers-color-scheme:dark){.contador{color:#2a1206}}
main{max-width:72rem;margin:0 auto;padding:1.5rem 1rem 3rem}
main:focus{outline:none}
h1{font-size:clamp(1.6rem,3vw,2.1rem);line-height:1.2;margin:.25rem 0 1rem}
h2{font-size:1.35rem;line-height:1.3;margin:2rem 0 .75rem}
h3{font-size:1.1rem;margin:1.25rem 0 .5rem}
.migalhas ol{list-style:none;padding:0;margin:0 0 1rem;display:flex;flex-wrap:wrap;gap:.4rem;color:var(--suave);font-size:.95rem}
.migalhas li+li::before{content:"›";margin-right:.4rem}
.chamada{background:linear-gradient(120deg,var(--primaria),#3a6fc0);color:#fff;border-radius:var(--raio);padding:1.5rem 1.5rem 1.6rem;margin-bottom:2rem}
@media (prefers-color-scheme:dark){.chamada{background:#203a5e}}
.chamada h1{margin:0 0 .4rem}
.chamada p{margin:0;max-width:40rem}
.vitrine{list-style:none;padding:0;margin:0;display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))}
.card{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);box-shadow:var(--sombra);display:flex;flex-direction:column;height:100%;overflow:hidden}
.ilustracao{display:grid;place-items:center;aspect-ratio:4/3;font-size:4rem}
.card .corpo{padding:1rem 1rem 1.1rem;display:flex;flex-direction:column;gap:.4rem;flex:1}
.card h2{font-size:1.1rem;margin:0}
.card h2 a{color:var(--tinta);text-decoration:none}
.card h2 a:hover{text-decoration:underline}
.categoria{color:var(--suave);font-size:.85rem;margin:0}
.resumo{color:var(--suave);margin:0;font-size:.95rem}
.preco{font-size:1.35rem;font-weight:800;margin:.2rem 0 0}
.parcelas{color:var(--suave);font-size:.9rem;margin:0}
.card form{margin-top:auto;padding-top:.5rem}
.botao{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;font:inherit;font-weight:700;background:var(--primaria);color:var(--primaria-tinta);border:2px solid var(--primaria);border-radius:10px;padding:.65rem 1.2rem;text-decoration:none;cursor:pointer;line-height:1.3}
.botao:hover{filter:brightness(1.08)}
.botao.largo{width:100%}
.botao.secundario{background:transparent;color:var(--primaria)}
.botao.pequeno{padding:.35rem .8rem;font-size:.95rem}
.botao.destaque{background:var(--destaque);border-color:var(--destaque);color:#fff}
@media (prefers-color-scheme:dark){.botao.destaque{color:#2a1206}}
.produto{display:grid;gap:2rem;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
@media (max-width:48rem){.produto{grid-template-columns:1fr}}
.produto .ilustracao{border-radius:var(--raio);font-size:8rem;border:1px solid var(--borda)}
.compra{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);padding:1.25rem;margin:1rem 0}
.campo{margin-bottom:1rem}
.campo label,.rotulo{display:block;font-weight:700;margin-bottom:.3rem}
.campo .dica{display:block;color:var(--suave);font-size:.92rem;margin:-.1rem 0 .35rem}
input[type=text],input[type=email],input[type=tel],input[type=number],select{width:100%;max-width:32rem;font:inherit;color:var(--tinta);background:var(--papel);border:2px solid var(--borda);border-radius:10px;padding:.55rem .7rem}
input[type=number].qtd{width:5.5rem}
select.qtd{width:6rem}
[aria-invalid=true]{border-color:var(--alerta)!important}
.erro-campo{display:block;color:var(--alerta);font-weight:700;margin:.3rem 0 0}
fieldset{border:1px solid var(--borda);border-radius:var(--raio);padding:1rem 1.25rem .5rem;margin:0 0 1.5rem;background:var(--papel)}
legend{font-weight:800;font-size:1.15rem;padding:0 .4rem}
.opcao{display:flex;gap:.6rem;align-items:flex-start;padding:.6rem .2rem;border-bottom:1px solid var(--borda)}
.opcao:last-of-type{border-bottom:0}
.opcao input{margin-top:.35rem;width:1.15rem;height:1.15rem;accent-color:var(--primaria)}
.opcao label{font-weight:600}
.opcao .dica{display:block;font-weight:400;color:var(--suave);font-size:.92rem}
.grade{display:grid;gap:0 1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.colunas{display:grid;gap:2rem;grid-template-columns:minmax(0,1.6fr) minmax(16rem,1fr);align-items:start}
@media (max-width:56rem){.colunas{grid-template-columns:1fr}}
.resumo-pedido{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);padding:1.25rem;position:sticky;top:1rem}
.resumo-pedido h2{margin-top:0}
.linhas{list-style:none;padding:0;margin:0}
.linhas li{display:flex;justify-content:space-between;gap:1rem;padding:.35rem 0;border-bottom:1px dashed var(--borda)}
.linhas li.total{font-weight:800;font-size:1.15rem;border-bottom:0}
table{width:100%;border-collapse:collapse;background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);overflow:hidden}
caption{text-align:left;font-weight:700;padding:.5rem 0;color:var(--suave)}
th,td{text-align:left;padding:.7rem .8rem;border-bottom:1px solid var(--borda);vertical-align:middle}
thead th{background:color-mix(in srgb,var(--borda) 35%,var(--papel))}
td.num,th.num{text-align:right;white-space:nowrap}
.linha-acoes{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
@media (max-width:40rem){
  table.responsiva thead{position:absolute;left:-9999px}
  table.responsiva tr{display:block;border-bottom:1px solid var(--borda);padding:.5rem 0}
  table.responsiva td,table.responsiva th[scope=row]{display:block;border:0;padding:.25rem .8rem;text-align:left}
  table.responsiva td[data-rotulo]::before{content:attr(data-rotulo) ": ";font-weight:700}
}
.aviso{border-radius:var(--raio);padding:1rem 1.25rem;margin:0 0 1.5rem;border:2px solid;background:var(--papel)}
.aviso.sucesso{border-color:var(--sucesso)}
.aviso.atencao{border-color:var(--alerta)}
.aviso h2{margin:0 0 .4rem;font-size:1.2rem}
.aviso p{margin:.25rem 0}
.aviso ul{margin:.4rem 0 0}
.confirmacao{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);padding:1.5rem;margin-bottom:1.5rem}
.selo-ok{display:inline-grid;place-items:center;width:3rem;height:3rem;border-radius:50%;background:var(--sucesso);color:#fff;font-size:1.6rem;margin-bottom:.5rem}
@media (prefers-color-scheme:dark){.selo-ok{color:#0f2a18}}
dl.dados{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1.25rem;margin:0}
dl.dados dt{font-weight:700;color:var(--suave)}
dl.dados dd{margin:0}
@media (max-width:30rem){dl.dados{grid-template-columns:1fr}dl.dados dd{margin-bottom:.5rem}}
.situacao{display:inline-block;padding:.1rem .6rem;border-radius:999px;font-size:.9rem;font-weight:700;border:2px solid currentColor}
.situacao.ok{color:var(--sucesso)}
.situacao.espera{color:var(--alerta)}
.lista-pedidos{list-style:none;padding:0;margin:0;display:grid;gap:1rem}
.lista-pedidos li{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);padding:1rem 1.25rem}
.lista-pedidos h2{margin:0 0 .3rem;font-size:1.15rem}
.vazio{background:var(--papel);border:1px dashed var(--borda);border-radius:var(--raio);padding:2rem;text-align:center}
.rodape{border-top:1px solid var(--borda);background:var(--papel);color:var(--suave);font-size:.92rem}
.rodape .interno{max-width:72rem;margin:0 auto;padding:1.5rem 1rem 2rem;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.rodape h2{font-size:1rem;color:var(--tinta);margin:0 0 .4rem}
.rodape p{margin:.2rem 0}
`;
