# Loja do Érico (fictícia) e Receita de Brinquedo

Projeto de brincadeira e estudo: uma loja virtual fictícia que emite **notas fiscais de brinquedo** no leiaute da NF-e 4.00, e uma **autorizadora de brinquedo** que simula os web services de uma SEFAZ.

> **Nada aqui tem valor fiscal.** A autorizadora não é, não imita e não conversa com nenhuma SEFAZ real. A UF usada é a 99, que não existe. O CNPJ do emitente é inventado. Os certificados são de uma AC de brinquedo, criada por um script, sem nenhum valor jurídico.

Stack: Bun, TypeScript, Hono (com JSX no servidor), SQLite (`bun:sqlite`), xml-crypto, node-forge, pdfkit, bwip-js e nodemailer.

## Sumário

1. Visão geral
2. Fluxo técnico completo
3. Estrutura do repositório
4. Como rodar localmente
5. Certificados (AC de brinquedo)
6. Modo caos
7. E-mail
8. Testes
9. Acessibilidade
10. Deploy (GitHub Actions + VPS)
11. TLS mútuo atrás de proxy reverso
12. Secrets e variáveis do GitHub
13. Logs e diagnóstico
14. Diferenças em relação à NF-e de verdade

## 1. Visão geral

São dois servidores:

- **Loja** (`loja/`, porta 3000): vitrine, página de produto, carrinho, checkout, confirmação do pedido e "Meus pedidos". Para o cliente, é uma loja normal: nenhum detalhe técnico aparece na tela. Por trás, no fechamento do pedido, a loja monta, assina e transmite a NF-e, gera o DANFE e manda tudo por e-mail.
- **Autorizadora "Receita de Brinquedo"** (`autorizadora/`), com duas portas:
  - porta 8443: web services SOAP 1.2 `NFeAutorizacao4`, `NFeRetAutorizacao4` e `NFeConsultaProtocolo4`, com **TLS mútuo** (só aceita certificado cliente da AC de brinquedo);
  - porta 3001: página pública de consulta, onde qualquer pessoa digita a chave de acesso e vê a situação da nota (é para onde aponta o QR Code do DANFE).

Mais o diretório `ac/`, com o script openssl que cria a AC raiz de brinquedo e os certificados.

## 2. Fluxo técnico completo

### 2.1. Fechamento do pedido

1. O cliente confirma o pedido. O pagamento é simulado (Pix, boleto ou cartão, sem pedir dados de cartão e sem cobrar nada).
2. Numa única transação do SQLite, a loja grava o pedido, **reserva o próximo número da nota** (série 1), monta o XML e assina. A nota fica presa ao pedido: reenvios usam sempre o mesmo XML assinado. **Nunca se gera número novo para a mesma venda.**
3. O XML segue o leiaute da NF-e modelo 55, versão 4.00, **sem espaços nem quebras entre as tags**:
   - `ide` com `indPres=2` (operação pela internet), `indIntermed=0` (sem intermediador), `indFinal=1`, `tpAmb=2` (homologação), `cUF=99`;
   - `emit` com o emitente fictício "Loja do Érico (fictícia)" (CNPJ 99.999.001/0001-59, inventado), optante pelo Simples (CRT 1, CSOSN 102);
   - `dest` preenchido (CPF, nome, endereço e e-mail);
   - `det` com os itens (NCM, CFOP 6102 para fora da UF do emitente), frete rateado entre os itens;
   - `total/ICMSTot`, `transp` (frete por conta do remetente) e `pag` (Pix 17, boleto 15, cartão 03 com grupo `card`);
   - `infAdic/infCpl` com "DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL".
4. **Chave de acesso** (44 dígitos): `cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) cNF(8) DV(1)`. O DV é o módulo 11 com pesos de 2 a 9 da direita para a esquerda; resto 0 ou 1 dá DV 0. O `cNF` é aleatório e nunca igual ao número da nota. Código: `comum/chave.ts`.
5. **Assinatura XMLDSig** do `infNFe` (`comum/assinatura.ts`): assinatura envelopada, canonicalização C14N (`REC-xml-c14n-20010315`), RSA-SHA1, digest SHA-1, referência `#NFe<chave>` e o certificado em `KeyInfo/X509Data/X509Certificate`. A chave privada e o certificado vêm do `loja.pfx` (simula um e-CNPJ A1), aberto com node-forge.

### 2.2. Transmissão

1. A loja monta o `enviNFe` com `indSinc=1` (resposta síncrona) e um `idLote`, embrulha no envelope SOAP 1.2 (`nfeDadosMsg`) e faz POST em `/ws/NFeAutorizacao4.asmx` com **TLS mútuo**: apresenta o certificado da loja e confere o certificado do servidor contra a AC de brinquedo.
2. A autorizadora valida, nesta ordem (`autorizadora/src/servicos.ts`):
   1. envelope SOAP e estrutura do lote (Fault SOAP ou cStat 225, 239, 452);
   2. ambiente (252) e UF (226);
   3. DV da chave (253) e se o `Id` bate com os campos da nota (502);
   4. assinatura: padrão dos algoritmos (298), certificado (290, 291, 293) e valor (297);
   5. CNPJ do emitente contra o CNPJ do certificado (213);
   6. data de emissão no futuro (703);
   7. CPF do destinatário (237);
   8. cada item (`vProd = qCom x vUnCom`, 629), soma dos itens contra o total (564), frete (535), total da nota (610) e pagamentos (865);
   9. duplicidade: mesma chave (204) ou mesmo número com outra chave (539);
   10. sequência de numeração: número maior que "último autorizado + 1" é rejeitado (999, "Erro não catalogado", com o motivo no texto).
3. Se passou em tudo, gera o **nProt** sequencial (15 dígitos), grava a nota no SQLite e devolve `retEnviNFe` com cStat 104 (lote processado) e o `protNFe` com cStat 100 (autorizado o uso), `nProt`, `dhRecbto` e `digVal`. O `infProt` vai assinado pela autorizadora.

### 2.3. Como a loja trata cada resposta

Código: `loja/src/nfe/emissor.ts`.

- **104 + 100**: autorizada. A loja monta o `nfeProc` (NF-e assinada + protocolo), gera o DANFE e envia o e-mail.
- **104 + rejeição**: registra no log, com cStat e xMotivo, e mostra ao cliente uma mensagem amigável ("Tivemos um problema ao emitir a sua nota fiscal e nossa equipe já está cuidando disso..."). Rejeição exige correção manual.
- **104 + 204 (duplicidade)**: a nota já tinha sido autorizada antes e a resposta se perdeu. A loja consulta pela chave e recupera o protocolo.
- **103 (lote recebido)**: guarda o recibo (`nRec`) e consulta `NFeRetAutorizacao4` algumas vezes (105 = em processamento). Se não sair o resultado, deixa para a fila. 106 (recibo não localizado) volta para o caminho seguro: consulta pela chave e, se preciso, reenvia.
- **Timeout ou conexão derrubada**: não dá para saber se a nota foi autorizada. A nota fica marcada como "envio incerto" e a loja **consulta pela chave antes de reenviar** (`NFeConsultaProtocolo4`): se vier 100, guarda o protocolo; se vier 217 (não consta), reenvia o mesmo XML. Se nem a consulta funcionar, a nota vai para a **fila de reprocessamento**.
- **Fila de reprocessamento**: roda a cada `LOJA_INTERVALO_FILA_MS` e tenta de novo com espera crescente (30 s, 1 min, 2 min, 5 min e depois a cada 10 min). Ela também reenvia e-mails que falharam.

A tela de confirmação espera a emissão por até `LOJA_ESPERA_CHECKOUT_MS`. Depois disso, a emissão continua em segundo plano e a tela diz "Não conseguimos emitir a nota agora, já estamos tentando de novo".

### 2.4. DANFE, e-mail e consulta

- **DANFE** (`loja/src/danfe.ts`): PDF A4 no layout tradicional, com canhoto, quadro do emitente, quadro DANFE, código de barras CODE-128 da chave, chave formatada, protocolo, destinatário, pagamento, cálculo do imposto, transportador, produtos e dados adicionais. O **QR Code** aponta para a página de consulta da Receita de Brinquedo. "DOCUMENTO DE BRINQUEDO - SEM VALOR FISCAL" aparece no topo, no quadro do fisco e como marca d'água. O PDF é **estruturado (tagged)**, com idioma pt-BR e título, para o leitor de tela ler títulos, campos e a tabela em ordem lógica.
- **E-mail**: assunto "Sua nota fiscal - Loja do Érico (fictícia)", HTML simples e acessível mais versão em texto puro, PDF e XML anexados, rodapé avisando que é documento de brinquedo.
- **Consulta pública**: `GET /consulta?chave=...` na porta 3001 mostra emitente, número, valor, destinatário com CPF mascarado, protocolo e data de autorização.

### 2.5. Tabela de cStat usados

| cStat | Significado (xMotivo) |
| --- | --- |
| 100 | Autorizado o uso da NF-e |
| 103 | Lote recebido com sucesso |
| 104 | Lote processado |
| 105 | Lote em processamento |
| 106 | Lote não localizado |
| 204 | Duplicidade de NF-e [nRec:...] |
| 213 | CNPJ-Base do Emitente difere do CNPJ-Base do Certificado Digital |
| 215 | Falha no schema XML |
| 217 | NF-e não consta na base de dados da SEFAZ |
| 225 | Falha no Schema XML do lote de NFe |
| 226 | Código da UF do Emitente diverge da UF autorizadora |
| 236 | Chave de Acesso com dígito verificador inválido (consulta) |
| 237 | CPF do destinatário inválido |
| 239 | Versão do arquivo XML não suportada |
| 252 | Ambiente informado diverge do Ambiente de recebimento |
| 253 | Digito Verificador da chave de acesso composta inválida |
| 290, 291, 293 | Certificado de assinatura inválido, fora da validade ou de cadeia desconhecida |
| 297 | Assinatura difere do calculado |
| 298 | Assinatura difere do padrão do Sistema |
| 452 | Resposta síncrona pedida para lote com mais de uma NF-e |
| 502 | Campo Id não corresponde à concatenação dos campos da chave |
| 535 | Total do Frete difere do somatório dos itens |
| 539 | Duplicidade de NF-e com diferença na Chave de Acesso |
| 564 | Total do Produto difere do somatório dos itens |
| 610 | Total da NF difere do somatório dos valores |
| 629 | Valor do Produto difere de Valor Unitário x Quantidade |
| 703 | Data-Hora de Emissão posterior ao horário de recebimento |
| 865 | Total dos pagamentos menor que o total da nota |
| 999 | Erro não catalogado (usado para numeração fora de sequência) |

## 3. Estrutura do repositório

- `ac/gerar-ac.sh`: cria a AC raiz de brinquedo e os certificados (saída em `ac/saida/`, fora do git).
- `comum/`: código compartilhado: chave de acesso, CPF/CNPJ, leitura do .pfx, assinatura e verificação XMLDSig, SOAP, XML compacto e log.
- `autorizadora/src/`: `servicos.ts` (validações e respostas), `app.ts` (rotas SOAP, modo caos e modo proxy), `paginas.tsx` (consulta pública), `banco.ts` (SQLite), `config.ts` e `index.ts`.
- `loja/src/`: `app.tsx` (rotas), `paginas/` (telas), `checkout.ts` (validação do formulário), `catalogo.ts`, `banco.ts`, `nfe/` (montagem do XML, cliente SOAP e emissor), `danfe.ts`, `email/` (interface e adaptadores), `config.ts` e `index.ts`.
- `testes/`: testes com `bun test`.
- `deploy/`: script que roda na VPS, exemplos de systemd, Caddy, nginx e dos arquivos de ambiente.
- `.github/workflows/`: CI e deploy.

## 4. Como rodar localmente

Pré-requisitos: Bun 1.4 ou mais novo e openssl.

1. Instale as dependências:

   ```bash
   bun install
   ```

2. Gere os certificados de brinquedo (senha padrão do .pfx: `brinquedo`):

   ```bash
   bun run ac
   ```

3. Opcional: copie o exemplo de configuração. Sem `.env`, os padrões já funcionam localmente.

   ```bash
   cp .env.example .env
   ```

4. Suba os dois servidores juntos:

   ```bash
   bun run dev
   ```

   Ou cada um no seu terminal, com `bun run autorizadora` e `bun run loja`.

5. Abra a loja em `http://localhost:3000` e a consulta em `http://localhost:3001`. Os e-mails ficam em `dados/emails/`, uma pasta por e-mail.

## 5. Certificados (AC de brinquedo)

O script `ac/gerar-ac.sh` cria:

- `raiz.crt` e `raiz.key`: a "AC Brinquedo Raiz", autoassinada, válida por 10 anos;
- `loja.pfx`: o certificado cliente da loja, no padrão de um e-CNPJ A1 (CN `LOJA DO ERICO FICTICIA:99999001000159`), exportado em PKCS#12 com senha. Também saem `loja.crt` e `loja.key` em PEM, para depuração;
- `autorizadora.crt` e `autorizadora.key`: o certificado servidor TLS da autorizadora, com os nomes e IPs informados.

Variáveis do script (todas opcionais):

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `AC_SAIDA` | `ac/saida` | Pasta de saída |
| `AC_SENHA_PFX` | `brinquedo` | Senha do `loja.pfx` |
| `AC_CNPJ_LOJA` | `99999001000159` | CNPJ no certificado (tem que ser igual a `LOJA_CNPJ`) |
| `AC_NOME_LOJA` | `LOJA DO ERICO FICTICIA` | Razão social no certificado |
| `AC_SERVIDOR_NOMES` | `localhost` | Nomes DNS da autorizadora, separados por vírgula |
| `AC_SERVIDOR_IPS` | `127.0.0.1` | IPs da autorizadora |
| `AC_DIAS` | `825` | Validade dos certificados finais |
| `AC_GRUPO` | (nenhum) | Grupo que pode ler os certificados (na VPS, `nfe`) |

Se a AC raiz já existe, o script a reaproveita e só gera de novo os certificados finais. Para recriar tudo, inclusive a raiz, use `--forcar`. Exemplo para a VPS:

```bash
AC_SAIDA=/etc/nfe-brinquedo/certs AC_GRUPO=nfe AC_SENHA_PFX='troque-esta-senha' AC_SERVIDOR_NOMES=nfe.SEU_DOMINIO,localhost bash ac/gerar-ac.sh
```

Para conferir um certificado:

```bash
openssl x509 -in ac/saida/loja.crt -noout -subject -issuer -dates
```

Nenhum `.pfx`, `.key`, `.crt` ou `.pem` entra no repositório: estão no `.gitignore`.

## 6. Modo caos

Com `AUT_CAOS=1`, cada envio de lote tem a chance `AUT_CAOS_PROBABILIDADE` (padrão 0,3) de sofrer um destes problemas:

- **atraso**: a autorizadora processa a nota e demora até `AUT_CAOS_ATRASO_MAX_MS` para responder. A loja estoura o timeout e precisa consultar pela chave;
- **103**: o lote vira assíncrono e só fica pronto depois de `AUT_LOTE_ASSINCRONO_MS`. A loja precisa consultar o recibo;
- **derrubar-antes**: a conexão cai antes de processar. A nota não consta e a loja reenvia;
- **derrubar-depois**: a conexão cai depois de autorizar. A loja descobre pela consulta por chave.

Para testar um caso específico, force-o em todo envio com `AUT_CAOS_FORCAR=atraso`, `103`, `derrubar-antes` ou `derrubar-depois`. Nada disso aparece para o cliente: só nos logs.

## 7. E-mail

O envio fica isolado em `loja/src/email/`. A loja só conhece a interface:

```ts
enviarNota(destinatario, pdf, xml, extras?)
```

O adaptador é escolhido por `EMAIL_ADAPTADOR`:

- `arquivo` (padrão, para desenvolvimento e testes): não envia nada. Salva cada e-mail em `EMAIL_PASTA`, numa pasta com `mensagem.html`, `mensagem.txt`, `mensagem.eml` (abre em qualquer programa de e-mail), `cabecalhos.json` e a pasta `anexos/`;
- `smtp`: qualquer servidor SMTP, configurado só por variáveis: `SMTP_HOST`, `SMTP_PORTA`, `SMTP_SEGURO` (1 para TLS direto na 465), `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE` e, opcionalmente, `EMAIL_RESPONDER_PARA`. A maioria dos provedores de e-mail transacional oferece SMTP, então em geral basta preencher essas variáveis.

### Como plugar outro serviço (por exemplo, uma API HTTP)

1. Crie uma classe que implemente `AdaptadorEmail` (em `loja/src/email/tipos.ts`): um `nome` e um método `enviar(mensagem, remetente)` que devolve `{ id }`. A `mensagem` já vem pronta, com assunto, HTML, texto e anexos.
2. Registre um novo valor de `EMAIL_ADAPTADOR` em `adaptadorDoAmbiente()` (`loja/src/email/index.ts`), lendo as credenciais de variáveis de ambiente.
3. Coloque as credenciais nos secrets do GitHub e no `deploy/remoto.sh`, na lista de variáveis que vão para o `segredos.env`.

Falhas de envio não desfazem a autorização: a nota fica sem `email_enviado_em` e a fila tenta de novo.

## 8. Testes

```bash
bun test
```

Os testes geram uma AC de brinquedo nova, numa pasta temporária, a cada execução. Cobrem:

- DV da chave (inclusive o exemplo do Manual de Orientação), CPF e CNPJ;
- assinatura e verificação (válida, adulterada, fora do padrão, sem assinatura, outra AC);
- TLS mútuo: sem certificado, com certificado de fora da AC e envelope inválido;
- cada cenário de rejeição da autorizadora, consultas, modo caos e modo proxy;
- DANFE (estrutura do PDF e, com `pdftotext` instalado, o texto) e e-mail (modelo, adaptador arquivo e SMTP contra um servidor falso);
- ponta a ponta: pedido, autorização, DANFE e e-mail no adaptador "arquivo"; queda de conexão antes e depois de autorizar; lote 103; timeout; rejeição; numeração sem buracos; acessibilidade básica e ausência de detalhes técnicos nas telas.

Para checar os tipos: `bun run typecheck`.

## 9. Acessibilidade

Toda a interface é HTML renderizado no servidor e funciona sem JavaScript:

- `lang="pt-BR"`, link "Pular para o conteúdo", landmarks (`header`, `nav` com rótulo, `main`, `footer`) e um único `h1` por página;
- o `<title>` de cada página anuncia o resultado da ação, por exemplo "Fone de ouvido sem fio Pulso foi adicionado ao carrinho. Carrinho" ou "Erro: falta corrigir 2 campos. Finalizar compra";
- formulários com `label`, `fieldset` e `legend` nos grupos de opções, dicas e erros ligados por `aria-describedby`, `aria-invalid` e um resumo de erros (`role="alert"`) com links para cada campo;
- botões repetidos têm nome único para o leitor de tela ("Adicionar Caneca de cerâmica Aurora 350 ml ao carrinho");
- ilustrações decorativas escondidas com `aria-hidden`, cores com contraste nos modos claro e escuro e foco visível. A auditoria com axe-core não apontou problemas em nenhuma página;
- o DANFE em PDF é estruturado (tagged) e o e-mail tem versão em texto puro.

## 10. Deploy (GitHub Actions + VPS)

### 10.1. Como funciona

- `.github/workflows/ci.yml` roda checagem de tipos e testes em todo push e pull request.
- `.github/workflows/deploy.yml` roda no push para a `main` (ou manualmente): roda os mesmos testes; se passarem, empacota o commit com `git archive`, envia por SSH para a VPS e executa `deploy/remoto.sh` lá.
- `deploy/remoto.sh` extrai a versão em `/opt/nfe-brinquedo/releases/<commit>`, cria os arquivos de configuração a partir dos exemplos se ainda não existirem, instala as dependências com o Bun, grava certificados e segredos vindos dos secrets, aponta `/opt/nfe-brinquedo/atual` para a nova versão, reinicia os serviços e confere `/saude` dos dois. **Se algum não responder, volta sozinho para a versão anterior.** Mantém as últimas 5 versões.

Como o código vai por SSH, a VPS não precisa de acesso ao GitHub, mesmo com repositório privado.

### 10.2. Subdomínios sugeridos

O domínio é uma variável: troque `SEU_DOMINIO` pelo seu (por exemplo, `exemplo.com.br`).

| Subdomínio | Serviço | Porta interna |
| --- | --- | --- |
| `loja.SEU_DOMINIO` | Loja (via proxy reverso, HTTPS público) | 3000 |
| `consulta.SEU_DOMINIO` | Página de consulta da Receita de Brinquedo (via proxy reverso) | 3001 |
| `nfe.SEU_DOMINIO` | Web service da autorizadora (opcional; veja a seção 11) | 8443 |

Crie registros DNS do tipo A (e AAAA, se tiver IPv6) apontando os três nomes para a VPS.

### 10.3. Preparar a VPS (uma vez só)

Os comandos assumem Debian ou Ubuntu, um usuário de deploy chamado `deploy` (o mesmo de `VPS_USER`) e systemd.

1. Instale o Bun em `/usr/local` (os serviços usam `/usr/local/bin/bun`):

   ```bash
   curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/usr/local bash
   ```

2. Crie o usuário dos serviços e as pastas:

   ```bash
   sudo useradd --system --home /var/lib/nfe-brinquedo --shell /usr/sbin/nologin nfe
   ```

   ```bash
   sudo usermod -aG nfe deploy
   ```

   ```bash
   sudo install -d -o deploy -g deploy /opt/nfe-brinquedo/releases
   ```

   ```bash
   sudo install -d -o deploy -g nfe -m 750 /etc/nfe-brinquedo /etc/nfe-brinquedo/certs
   ```

3. Crie a chave SSH do deploy (no seu computador) e autorize na VPS. A chave privada vira o secret `VPS_SSH_KEY`:

   ```bash
   ssh-keygen -t ed25519 -f deploy_nfe -C deploy-nfe-brinquedo -N ""
   ```

   Copie o conteúdo de `deploy_nfe.pub` para `/home/deploy/.ssh/authorized_keys` na VPS. Para o secret `VPS_KNOWN_HOSTS`, rode no seu computador `ssh-keyscan -H SEU_HOST` e confira a impressão digital com a da VPS.

4. Permita que o usuário de deploy reinicie só os dois serviços (troque `deploy` no arquivo se o seu usuário tiver outro nome):

   ```bash
   sudo visudo -f /etc/sudoers.d/nfe-brinquedo
   ```

   Cole o conteúdo de `deploy/systemd/sudoers-deploy`.

5. Cadastre os secrets obrigatórios no GitHub (seção 12) e rode o **primeiro deploy**: faça um push na `main` ou dispare o workflow "Deploy" na aba Actions. Esse primeiro deploy deve parar com um erro dizendo que faltam os certificados. É esperado: ele já deixou o código em `/opt/nfe-brinquedo/releases/` e criou `/etc/nfe-brinquedo/loja.env` e `autorizadora.env` a partir dos exemplos.

6. Na VPS, guarde o caminho da versão que chegou:

   ```bash
   REL=$(ls -1dt /opt/nfe-brinquedo/releases/*/ | head -1)
   ```

7. Edite `/etc/nfe-brinquedo/loja.env` e troque `SEU_DOMINIO` pelo seu domínio. Em `autorizadora.env`, os padrões já servem para a opção 1.

8. Certificados: escolha **um** dos caminhos.
   - Gerar direto na VPS (mais simples). Troque a senha e o domínio, e cadastre a mesma senha no secret `LOJA_PFX_SENHA`:

     ```bash
     AC_SAIDA=/etc/nfe-brinquedo/certs AC_GRUPO=nfe AC_SENHA_PFX='troque-esta-senha' AC_SERVIDOR_NOMES=nfe.SEU_DOMINIO,localhost bash "$REL/ac/gerar-ac.sh"
     ```

     O `AC_GRUPO=nfe` deixa os serviços lerem os certificados; a chave da AC raiz (`raiz.key`) continua só sua. Se quiser, copie a `raiz.key` para fora da VPS e apague: ela só é usada para emitir certificados novos.
   - Mandar pelos secrets: gere no seu computador com `bun run ac` e cadastre os secrets dos certificados em base64 (seção 12).

9. Instale os serviços systemd:

   ```bash
   sudo cp "$REL"/deploy/systemd/*.service /etc/systemd/system/
   ```

   ```bash
   sudo systemctl daemon-reload
   ```

   ```bash
   sudo systemctl enable autorizadora-brinquedo loja-brinquedo
   ```

10. Proxy reverso: escolha Caddy ou nginx (seção 10.5), copie o exemplo de `"$REL"/deploy/` e libere as portas 80 e 443 no firewall. Na opção 1 de TLS mútuo, libere também a 8443 se quiser chamar a autorizadora de fora da VPS.

11. Rode o deploy de novo (botão "Re-run jobs" na aba Actions). Agora ele deve terminar com "serviços no ar". Daí em diante, todo push na `main` publica sozinho.

### 10.4. Gerenciador de processos

Os exemplos usam **systemd**, que já vem na maioria das distribuições, reinicia os serviços se caírem, sobe tudo no boot e manda os logs para o `journalctl`. É a recomendação para este projeto.

Se preferir outro (pm2, supervisord, Docker), o que muda é só a função `reiniciar` do `deploy/remoto.sh` e o modo de passar as variáveis de ambiente. O comando de cada serviço continua `bun autorizadora/src/index.ts` e `bun loja/src/index.ts`, rodando dentro de `/opt/nfe-brinquedo/atual`.

### 10.5. Proxy reverso: Caddy ou nginx

- **Caddy** (`deploy/caddy/Caddyfile`): configuração curta e HTTPS automático com Let's Encrypt, sem certbot. Defina a variável `DOMINIO` no serviço do Caddy (`sudo systemctl edit caddy`, linha `Environment=DOMINIO=exemplo.com.br`). Recomendado se você ainda não usa nada.
- **nginx** (`deploy/nginx/nfe-brinquedo.conf`): bom se a VPS já tem nginx com outros sites. Os certificados públicos vêm do certbot (`sudo certbot --nginx -d loja.SEU_DOMINIO -d consulta.SEU_DOMINIO`).

Nos dois casos, a loja e a consulta escutam só em `127.0.0.1` e o proxy publica as duas. Com HTTPS na frente, use `LOJA_COOKIE_SEGURO=1`.

## 11. TLS mútuo atrás de proxy reverso

O web service da autorizadora exige certificado cliente. Um proxy reverso comum termina o TLS e a autorizadora deixa de ver o certificado. Há duas saídas:

### Opção 1 (padrão): a autorizadora termina o TLS ela mesma

- A autorizadora escuta na porta 8443 (`AUT_MTLS_MODO=direto`), com o certificado servidor da AC de brinquedo, e exige o certificado cliente. O proxy não participa.
- A loja, na mesma VPS, usa `LOJA_AUTORIZADORA_URL=https://localhost:8443` e confia na AC de brinquedo (padrão). Para acessar de fora, use `https://nfe.SEU_DOMINIO:8443` e gere o certificado do servidor com `AC_SERVIDOR_NOMES=nfe.SEU_DOMINIO,localhost`.
- Vantagens: a verificação acontece de ponta a ponta, sem confiar em cabeçalhos, e o proxy fica simples. Desvantagem: uma porta a mais e um certificado servidor que navegadores não reconhecem (o que é normal aqui, porque só a loja conversa com esse serviço).
- Variação com nginx: dá para usar a porta 443 com `stream` + `ssl_preread` encaminhando `nfe.SEU_DOMINIO` para a 8443 sem terminar o TLS (passthrough). Fica como exercício.

### Opção 2: o proxy verifica o certificado e repassa

- O proxy termina o TLS com certificado público, exige o certificado cliente da AC de brinquedo e repassa o resultado em cabeçalhos: `X-SSL-Client-Verify: SUCCESS`, `X-SSL-Client-Cert` (o certificado) e `X-Proxy-Segredo` (um segredo compartilhado).
- A autorizadora roda com `AUT_MTLS_MODO=proxy`, escuta só em `127.0.0.1`, aceita só requisições com os cabeçalhos certos e confere de novo a cadeia do certificado repassado.
- A loja usa `LOJA_AUTORIZADORA_URL=https://nfe.SEU_DOMINIO` e `LOJA_CA_SERVIDOR=sistema` (o certificado do proxy é de uma AC pública).
- Exemplos: `deploy/caddy/Caddyfile.opcao2-proxy-mtls` e `deploy/nginx/opcao2-proxy-mtls.conf`. Cadastre o secret `AUT_PROXY_SEGREDO` e use o mesmo valor no proxy.
- Cuidado: nesse modo a autorizadora confia no proxy. Por isso ela só escuta em `127.0.0.1` e exige o segredo.

## 12. Secrets e variáveis do GitHub

Cadastre em Settings, Secrets and variables, Actions. O workflow usa o ambiente `producao`, onde você pode exigir aprovação manual antes de cada deploy.

### Secrets obrigatórios

| Secret | O que é |
| --- | --- |
| `VPS_HOST` | IP ou nome da VPS |
| `VPS_USER` | Usuário de deploy (ex.: `deploy`) |
| `VPS_SSH_KEY` | Chave privada SSH desse usuário (conteúdo inteiro do arquivo) |

### Secrets recomendados

| Secret | O que é |
| --- | --- |
| `VPS_KNOWN_HOSTS` | Saída de `ssh-keyscan -H SEU_HOST`. Sem ele, o workflow confia na chave apresentada na hora (avisa no log). |
| `VPS_PORT` | Porta SSH, se não for 22 |
| `LOJA_PFX_SENHA` | Senha do `loja.pfx` |

### Secrets de certificados (opcionais, se não gerar na VPS)

Gere o base64 com `base64 -w0 arquivo`.

| Secret | Arquivo |
| --- | --- |
| `AC_RAIZ_CRT_B64` | `raiz.crt` |
| `LOJA_PFX_B64` | `loja.pfx` |
| `AUTORIZADORA_CRT_B64` | `autorizadora.crt` |
| `AUTORIZADORA_KEY_B64` | `autorizadora.key` |
| `AUT_PROXY_SEGREDO` | Só na opção 2 de TLS mútuo |

A chave privada da AC raiz (`raiz.key`) não precisa ir para a VPS.

### Secrets de e-mail (quando escolher o serviço)

| Secret | O que é |
| --- | --- |
| `EMAIL_REMETENTE` | Ex.: `"Loja do Érico (fictícia)" <nao-responda@SEU_DOMINIO>` |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_SEGURO` | Servidor SMTP |
| `SMTP_USUARIO`, `SMTP_SENHA` | Credenciais |

### Variáveis (não secretas)

| Variável | Padrão | O que é |
| --- | --- | --- |
| `EMAIL_ADAPTADOR` | `arquivo` | `smtp` para enviar de verdade |
| `APP_DIR` | `/opt/nfe-brinquedo` | Pasta da aplicação na VPS |
| `CONF_DIR` | `/etc/nfe-brinquedo` | Pasta de configuração e certificados |

Os secrets chegam à VPS pela entrada padrão do SSH (nunca pela linha de comando) e são gravados em `/etc/nfe-brinquedo/segredos.env` e `/etc/nfe-brinquedo/certs/`, com permissão 640 e grupo `nfe`. Nada disso entra no repositório.

## 13. Logs e diagnóstico

Os dois serviços escrevem uma linha JSON por evento, com cStat, xMotivo, chave, recibo e protocolo. Na VPS:

```bash
journalctl -u loja-brinquedo -f
```

```bash
journalctl -u autorizadora-brinquedo -o cat | jq 'select(.nivel != "info")'
```

Eventos úteis da loja: `nota.criada`, `nota.enviando`, `nota.retorno_lote`, `nota.envio_sem_resposta`, `nota.consulta_chave`, `nota.reprocessamento_agendado`, `nota.autorizada`, `nota.rejeitada`, `nota.email_enviado`. Da autorizadora: `nfe.autorizada`, `nfe.rejeitada`, `lote.recebido`, `caos`, `ws.certificado_recusado`.

Os bancos ficam em `/var/lib/nfe-brinquedo/` (`loja.sqlite` e `autorizadora.sqlite`). Para ver as notas que precisam de atenção:

```bash
sqlite3 /var/lib/nfe-brinquedo/loja.sqlite "select pedido_id, numero, situacao, ultimo_cstat, ultimo_motivo from notas where situacao != 'autorizada'"
```

## 14. Diferenças em relação à NF-e de verdade

- UF 99, CNPJ e município inventados (o município do destinatário vai com o código 9999999, sem tabela do IBGE); nada é validado contra os XSD oficiais.
- Só os grupos necessários para uma venda simples do Simples Nacional; sem IBS/CBS da reforma tributária, sem DIFAL, sem eventos (cancelamento, carta de correção) e sem inutilização.
- A regra de sequência de numeração (rejeitar números que pulam) não existe na SEFAZ real; ela foi pedida para o estudo.
- O CNPJ do certificado vem do CN (`NOME:CNPJ`), e não da extensão ICP-Brasil (OID 2.16.76.1.3.3).
- O QR Code do DANFE só aponta para a página de consulta, sem os parâmetros e o hash do QR Code oficial.
