#!/usr/bin/env bash
# Roda NA VPS, chamado pelo workflow de deploy (via ssh, com as variáveis exportadas antes).
# Também pode ser rodado à mão: GITHUB_SHA=<commit> bash deploy/remoto.sh
#
# O que faz:
#   1. extrai o código enviado em /opt/nfe-brinquedo/releases/<commit>
#   2. instala as dependências com o Bun
#   3. grava certificados e segredos que vieram dos secrets do GitHub (se vieram)
#   4. aponta /opt/nfe-brinquedo/atual para a nova versão e reinicia os serviços
#   5. confere se os dois serviços respondem; se não, volta para a versão anterior
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nfe-brinquedo}"
CONF_DIR="${CONF_DIR:-/etc/nfe-brinquedo}"
CERT_DIR="$CONF_DIR/certs"
COMMIT="${GITHUB_SHA:?GITHUB_SHA não informado}"
PACOTE="/tmp/nfe-brinquedo-$COMMIT.tar.gz"
GRUPO_SERVICO="${GRUPO_SERVICO:-nfe}"
SERVICOS=(autorizadora-brinquedo loja-brinquedo)
MANTER_VERSOES=5

log() { printf '[deploy] %s\n' "$*"; }
falha() { printf '[deploy] ERRO: %s\n' "$*" >&2; exit 1; }

BUN="$(command -v bun || true)"
[[ -z "$BUN" && -x /usr/local/bin/bun ]] && BUN=/usr/local/bin/bun
[[ -z "$BUN" && -x "$HOME/.bun/bin/bun" ]] && BUN="$HOME/.bun/bin/bun"
[[ -n "$BUN" ]] || falha "Bun não encontrado na VPS. Instale com: curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/usr/local bash"
[[ -f "$PACOTE" ]] || falha "pacote $PACOTE não encontrado"
[[ -d "$APP_DIR" && -w "$APP_DIR" ]] || falha "$APP_DIR não existe ou não pode ser escrita por $(whoami). Veja o README (preparar a VPS)."

# 1) Código ------------------------------------------------------------------
DESTINO="$APP_DIR/releases/$COMMIT"
log "extraindo $COMMIT"
rm -rf "$DESTINO"
mkdir -p "$DESTINO"
tar -xzf "$PACOTE" -C "$DESTINO"
rm -f "$PACOTE"

# 2) Dependências -------------------------------------------------------------
log "instalando dependências"
(cd "$DESTINO" && "$BUN" install --frozen-lockfile --production)

# 3) Configuração, certificados e segredos ----------------------------------
# Na primeira vez, copia os exemplos de configuração (nunca sobrescreve).
for f in loja.env autorizadora.env; do
  if [[ ! -f "$CONF_DIR/$f" ]]; then
    install -m 640 "$DESTINO/deploy/env/$f" "$CONF_DIR/$f"
    chgrp "$GRUPO_SERVICO" "$CONF_DIR/$f" 2>/dev/null || true
    log "AVISO: criei $CONF_DIR/$f a partir do exemplo. Edite e troque SEU_DOMINIO."
  fi
done

grava_b64() { # grava_b64 <conteúdo base64> <arquivo>
  local tmp
  tmp="$(mktemp "$CERT_DIR/.tmp.XXXXXX")"
  printf '%s' "$1" | base64 -d > "$tmp" || { rm -f "$tmp"; falha "base64 inválido para $2"; }
  chmod 640 "$tmp"
  chgrp "$GRUPO_SERVICO" "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$CERT_DIR/$2"
  log "certificado atualizado: $CERT_DIR/$2"
}
if [[ -n "${AC_RAIZ_CRT_B64:-}${LOJA_PFX_B64:-}${AUTORIZADORA_CRT_B64:-}${AUTORIZADORA_KEY_B64:-}" ]]; then
  mkdir -p "$CERT_DIR"
  if [[ -n "${AC_RAIZ_CRT_B64:-}" ]]; then grava_b64 "$AC_RAIZ_CRT_B64" raiz.crt; fi
  if [[ -n "${LOJA_PFX_B64:-}" ]]; then grava_b64 "$LOJA_PFX_B64" loja.pfx; fi
  if [[ -n "${AUTORIZADORA_CRT_B64:-}" ]]; then grava_b64 "$AUTORIZADORA_CRT_B64" autorizadora.crt; fi
  if [[ -n "${AUTORIZADORA_KEY_B64:-}" ]]; then grava_b64 "$AUTORIZADORA_KEY_B64" autorizadora.key; fi
fi
for f in raiz.crt loja.pfx autorizadora.crt autorizadora.key; do
  [[ -f "$CERT_DIR/$f" ]] || falha "falta $CERT_DIR/$f. Gere na VPS com: AC_SAIDA=$CERT_DIR AC_GRUPO=$GRUPO_SERVICO bash $DESTINO/ac/gerar-ac.sh (veja o README) ou cadastre os secrets dos certificados."
done

# segredos.env: só é reescrito quando algum segredo veio do GitHub.
SEGREDOS=""
for v in LOJA_PFX_SENHA AUT_PROXY_SEGREDO EMAIL_ADAPTADOR EMAIL_REMETENTE SMTP_HOST SMTP_PORTA SMTP_SEGURO SMTP_USUARIO SMTP_SENHA; do
  valor="${!v:-}"
  [[ -z "$valor" ]] && continue
  [[ "$valor" == *$'\n'* ]] && falha "o secret $v não pode ter quebra de linha"
  # Aspas simples: o systemd lê o valor literalmente (escapando as aspas simples internas).
  SEGREDOS+="$v='${valor//\'/\'\\\'\'}'"$'\n'
done
if [[ -n "$SEGREDOS" ]]; then
  tmp="$(mktemp "$CONF_DIR/.segredos.XXXXXX")"
  printf '# Gerado pelo deploy a partir dos secrets do GitHub. Não edite à mão.\n%s' "$SEGREDOS" > "$tmp"
  chmod 640 "$tmp"
  chgrp "$GRUPO_SERVICO" "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$CONF_DIR/segredos.env"
  log "segredos.env atualizado"
fi

# 4) Troca de versão e reinício ---------------------------------------------
ANTERIOR="$(readlink -f "$APP_DIR/atual" 2>/dev/null || true)"
ln -sfn "$DESTINO" "$APP_DIR/atual.novo"
mv -Tf "$APP_DIR/atual.novo" "$APP_DIR/atual"
log "versão ativa: $COMMIT"

reiniciar() {
  local existentes=()
  for s in "${SERVICOS[@]}"; do
    systemctl cat "$s.service" >/dev/null 2>&1 && existentes+=("$s")
  done
  if [[ ${#existentes[@]} -eq 0 ]]; then
    log "AVISO: nenhum serviço systemd instalado (${SERVICOS[*]}). Instale os arquivos de deploy/systemd (veja o README)."
    return 1
  fi
  sudo -n systemctl restart "${existentes[@]}"
}

saudavel() {
  local i
  for i in $(seq 1 ${TENTATIVAS_SAUDE:-20}); do
    if curl -fsS -m 2 http://127.0.0.1:3001/saude >/dev/null 2>&1 && curl -fsS -m 2 http://127.0.0.1:3000/saude >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if reiniciar; then
  if saudavel; then
    log "serviços no ar"
  else
    log "os serviços não responderam; voltando para a versão anterior"
    if [[ -n "$ANTERIOR" && -d "$ANTERIOR" ]]; then
      ln -sfn "$ANTERIOR" "$APP_DIR/atual.novo"
      mv -Tf "$APP_DIR/atual.novo" "$APP_DIR/atual"
      reiniciar || true
    fi
    for s in "${SERVICOS[@]}"; do sudo -n journalctl -u "$s" -n 30 --no-pager 2>/dev/null || true; done
    falha "deploy de $COMMIT falhou"
  fi
else
  falha "não foi possível reiniciar os serviços"
fi

# 5) Limpeza: mantém só as últimas versões -----------------------------------
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +$((MANTER_VERSOES + 1)) | while read -r velho; do
  [[ "$(readlink -f "$velho")" == "$(readlink -f "$APP_DIR/atual")" ]] && continue
  rm -rf "$velho"
done
log "pronto"
