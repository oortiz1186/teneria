#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${TENERIA_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${TENERIA_ENV_FILE:-$APP_DIR/.env}"
BACKUP_ROOT="${TENERIA_BACKUP_ROOT:-$APP_DIR/backups}"
RETENTION_DAYS="${TENERIA_BACKUP_RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no existe $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL no está definido}"
DOCUMENT_STORAGE_PATH="${DOCUMENT_STORAGE_PATH:-$APP_DIR/storage/documents}"

for command in pg_dump tar sha256sum gzip; do
  command -v "$command" >/dev/null 2>&1 || { echo "ERROR: falta el comando $command" >&2; exit 1; }
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOST="$(hostname -s 2>/dev/null || hostname)"
FINAL_DIR="$BACKUP_ROOT/$STAMP"
TMP_DIR="$BACKUP_ROOT/.tmp-$STAMP-$$"
mkdir -p "$TMP_DIR" "$BACKUP_ROOT"
trap 'rm -rf "$TMP_DIR"' EXIT

DB_FILE="$TMP_DIR/database.dump"
DOC_FILE="$TMP_DIR/documents.tar.gz"
MANIFEST="$TMP_DIR/manifest.txt"

printf 'Creando respaldo PostgreSQL...\n'
pg_dump --format=custom --no-owner --no-acl --file="$DB_FILE" "$DATABASE_URL"

printf 'Respaldando documentos...\n'
if [[ -d "$DOCUMENT_STORAGE_PATH" ]]; then
  tar -C "$DOCUMENT_STORAGE_PATH" -czf "$DOC_FILE" .
else
  tar -czf "$DOC_FILE" --files-from /dev/null
fi

DB_SHA="$(sha256sum "$DB_FILE" | awk '{print $1}')"
DOC_SHA="$(sha256sum "$DOC_FILE" | awk '{print $1}')"
DB_SIZE="$(stat -c %s "$DB_FILE")"
DOC_SIZE="$(stat -c %s "$DOC_FILE")"

cat > "$MANIFEST" <<EOF
version=1
created_at_utc=$STAMP
host=$HOST
database_file=database.dump
database_sha256=$DB_SHA
database_bytes=$DB_SIZE
documents_file=documents.tar.gz
documents_sha256=$DOC_SHA
documents_bytes=$DOC_SIZE
document_storage_path=$DOCUMENT_STORAGE_PATH
EOF

(
  cd "$TMP_DIR"
  sha256sum database.dump documents.tar.gz > SHA256SUMS
)

mv "$TMP_DIR" "$FINAL_DIR"
trap - EXIT

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20????????T??????Z' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +

printf 'Respaldo completado: %s\n' "$FINAL_DIR"
printf 'Base: %s bytes\nDocumentos: %s bytes\n' "$DB_SIZE" "$DOC_SIZE"
