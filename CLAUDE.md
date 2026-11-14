# CLAUDE.md

Projeto de estudo: loja virtual fictícia que emite notas fiscais de brinquedo (leiaute NF-e 4.00) e uma autorizadora de brinquedo ("Receita de Brinquedo") que simula uma SEFAZ. Nada tem valor fiscal nem fala com SEFAZ real. Detalhes completos no README.md.

O dono do projeto é cego e usa NVDA. Responda em português.

## Comandos

- `bun install`: dependências
- `bun run ac`: gera a AC de brinquedo e os certificados em `ac/saida/` (senha do .pfx: `brinquedo`)
- `bun run dev`: sobe autorizadora (8443 SOAP com TLS mútuo, 3001 consulta) e loja (3000)
- `bun test`: todos os testes (geram certificados próprios em pasta temporária)
- `bun run typecheck`: checagem de tipos
- Rode `bun test` e `bun run typecheck` antes de cada commit.

## Estrutura

- `ac/gerar-ac.sh`: AC raiz, e-CNPJ A1 (.pfx) e certificado da autorizadora
- `comum/`: chave de acesso (DV módulo 11), CPF/CNPJ, .pfx, XMLDSig, SOAP, XML, log
- `autorizadora/src/`: `servicos.ts` (validações e cStat), `app.ts` (rotas, caos, modo proxy), `paginas.tsx` (consulta pública)
- `loja/src/`: `app.tsx` (rotas), `paginas/` (telas JSX), `nfe/` (montagem, cliente SOAP, emissor), `danfe.ts`, `email/`
- `testes/`: `bun test`; `ponta-a-ponta.test.ts` sobe os dois servidores
- `deploy/` e `.github/workflows/`: deploy na VPS por SSH, systemd, Caddy, nginx

## Regras que não podem ser quebradas

- **Interface da loja sem detalhes técnicos**: nada de cStat, xMotivo, SOAP, XML, assinatura, chave de 44 dígitos solta, "autorizadora", "caos", logs ou JSON na tela. Só mensagens de loja real. Detalhes técnicos vão para o log (`comum/log.ts`) e para o README. Os testes de ponta a ponta checam isso.
- **Acessibilidade (NVDA)**: HTML semântico renderizado no servidor, funcionando sem JavaScript; `lang="pt-BR"`, link "Pular para o conteúdo", landmarks, um `h1` por página, `label` em todo campo, `fieldset`/`legend` em grupos, erros com `aria-invalid` e `aria-describedby`, resumo de erros com `role="alert"`, e `<title>` que anuncia o resultado da ação (ex.: "Erro: ..."). O DANFE é PDF estruturado (tagged).
- **Nunca gerar número novo de nota para a mesma venda**: a nota é criada com número e XML assinado na mesma transação do pedido; reenvios usam o mesmo XML. Depois de timeout, consultar pela chave antes de reenviar.
- **XML compacto**: sem espaços nem quebras entre as tags (use `el()` de `comum/xml.ts`).
- **Brinquedo explícito**: cUF 99, CNPJ fictício, "DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL" no DANFE e no e-mail. Nunca usar nome, logo ou marca de SEFAZ ou empresa real.
- **Segredos fora do git**: `.pfx`, `.key`, `.crt`, `.pem`, `.env` e `ac/saida/` nunca são commitados.
- **E-mail**: não usar Gmail; envio só pela interface `enviarNota` com adaptador escolhido por `EMAIL_ADAPTADOR`.

## Convenções

- Código, nomes e mensagens em português.
- Valores monetários em centavos (inteiros).
- Configuração por variáveis de ambiente, documentadas em `.env.example`.
