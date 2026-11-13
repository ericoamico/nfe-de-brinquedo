#!/usr/bin/env bash
# Gera a "AC Brinquedo Raiz" e os certificados de brinquedo do projeto:
#   - raiz.crt / raiz.key ............ AC raiz de brinquedo (autoassinada)
#   - loja.pfx (com senha) ........... certificado cliente da loja (simula um e-CNPJ A1)
#   - loja.crt / loja.key ............ o mesmo certificado em PEM (útil para depuração)
#   - autorizadora.crt / .key ........ certificado servidor TLS da autorizadora
#
# NADA disso tem valor jurídico ou fiscal. Os arquivos gerados nunca devem ir
# para o repositório (ac/saida/ está no .gitignore).
#
# Variáveis de ambiente (todas opcionais):
#   AC_SAIDA            pasta de saída (padrão: ac/saida)
#   AC_SENHA_PFX        senha do loja.pfx (padrão: brinquedo)
#   AC_CNPJ_LOJA        CNPJ fictício que vai no certificado da loja (padrão: 99999001000159)
#   AC_NOME_LOJA        razão social no certificado (padrão: LOJA DO ERICO FICTICIA)
#   AC_SERVIDOR_NOMES   nomes DNS da autorizadora, separados por vírgula (padrão: localhost)
#   AC_SERVIDOR_IPS     IPs da autorizadora, separados por vírgula (padrão: 127.0.0.1)
#   AC_DIAS             validade dos certificados finais em dias (padrão: 825)
#   AC_GRUPO            grupo que pode LER os certificados (ex.: nfe, o usuário dos serviços
#                       na VPS). A chave da AC raiz (raiz.key) continua só do dono.
#
# Opções:
#   --forcar            recria também a AC raiz (invalida todos os certificados antigos)
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAIDA="${AC_SAIDA:-$DIR_SCRIPT/saida}"
SENHA="${AC_SENHA_PFX:-brinquedo}"
CNPJ="${AC_CNPJ_LOJA:-99999001000159}"
NOME_LOJA="${AC_NOME_LOJA:-LOJA DO ERICO FICTICIA}"
NOMES="${AC_SERVIDOR_NOMES:-localhost}"
IPS="${AC_SERVIDOR_IPS:-127.0.0.1}"
DIAS="${AC_DIAS:-825}"
GRUPO="${AC_GRUPO:-}"
FORCAR=0
[[ "${1:-}" == "--forcar" ]] && FORCAR=1

command -v openssl >/dev/null || { echo "openssl não encontrado" >&2; exit 1; }
mkdir -p "$SAIDA"
chmod 700 "$SAIDA"
cd "$SAIDA"
umask 077

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) AC raiz ---------------------------------------------------------------
if [[ $FORCAR -eq 1 || ! -f raiz.key || ! -f raiz.crt ]]; then
  echo "Gerando AC Brinquedo Raiz..."
  openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout raiz.key -out raiz.crt \
    -subj "/C=BR/O=AC de Brinquedo/OU=Sem valor juridico/CN=AC Brinquedo Raiz" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" 2>/dev/null
else
  echo "Reaproveitando a AC raiz existente em $SAIDA/raiz.crt"
fi

serial() { openssl rand -hex 16; }

# 2) Certificado cliente da loja (e-CNPJ A1 de brinquedo) -----------------
echo "Gerando certificado cliente da loja (CNPJ $CNPJ)..."
cat > "$TMP/loja.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,nonRepudiation,keyEncipherment
extendedKeyUsage=clientAuth,emailProtection
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
EOF
openssl req -new -newkey rsa:2048 -nodes -keyout loja.key -out "$TMP/loja.csr" \
  -subj "/C=BR/O=AC de Brinquedo/OU=e-CNPJ A1 de brinquedo/CN=$NOME_LOJA:$CNPJ" 2>/dev/null
openssl x509 -req -in "$TMP/loja.csr" -CA raiz.crt -CAkey raiz.key -set_serial "0x$(serial)" \
  -days "$DIAS" -sha256 -extfile "$TMP/loja.ext" -out loja.crt 2>/dev/null
openssl pkcs12 -export -inkey loja.key -in loja.crt -certfile raiz.crt \
  -name "e-CNPJ de brinquedo" -passout "pass:$SENHA" \
  -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256 -out loja.pfx

# 3) Certificado servidor da autorizadora --------------------------------
echo "Gerando certificado servidor da autorizadora ($NOMES / $IPS)..."
SAN=""
IFS=',' read -ra LISTA <<< "$NOMES"
for n in "${LISTA[@]}"; do [[ -n "$n" ]] && SAN+="DNS:${n// /},"; done
IFS=',' read -ra LISTA <<< "$IPS"
for n in "${LISTA[@]}"; do [[ -n "$n" ]] && SAN+="IP:${n// /},"; done
SAN="${SAN%,}"
PRIMEIRO_NOME="${NOMES%%,*}"
cat > "$TMP/servidor.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
subjectAltName=$SAN
EOF
openssl req -new -newkey rsa:2048 -nodes -keyout autorizadora.key -out "$TMP/autorizadora.csr" \
  -subj "/C=BR/O=Receita de Brinquedo/CN=$PRIMEIRO_NOME" 2>/dev/null
openssl x509 -req -in "$TMP/autorizadora.csr" -CA raiz.crt -CAkey raiz.key -set_serial "0x$(serial)" \
  -days "$DIAS" -sha256 -extfile "$TMP/servidor.ext" -out autorizadora.crt 2>/dev/null

chmod 600 ./*.key loja.pfx
chmod 644 raiz.crt loja.crt autorizadora.crt
if [[ -n "$GRUPO" ]]; then
  # Os serviços (grupo $GRUPO) leem os certificados; a raiz.key fica só com o dono.
  chgrp "$GRUPO" . raiz.crt loja.pfx loja.crt loja.key autorizadora.crt autorizadora.key
  chmod 750 .
  chmod 640 loja.pfx loja.key autorizadora.key
  chmod 600 raiz.key
fi

openssl verify -CAfile raiz.crt loja.crt autorizadora.crt >/dev/null
echo "Pronto. Arquivos em $SAIDA:"
ls -1 "$SAIDA"
