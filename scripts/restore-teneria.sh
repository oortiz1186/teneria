#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: CONFIRM_RESTORE=YES $0 /ruta/al/respaldo/YYYYMMDDTHHMMSSZ" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "ERROR: restauración bloqueada. Ejecuta con CONFIRM_RESTORE=YES después de verificar que elegiste el respaldo correcto." >&2
  exit 1
fi

APP_DIR="${TENERIA_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${TENERIA_ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="$(cd "$1" && pwd)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no existe $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_DIR/database.dump" || ! -f "$BACKUP_DIR/documents.tar.gz" || ! -f "$BACKUP_DIR/SHA256SUMS" ]]; then
  echo "ERROR: el directorio no contiene un respaldo completo." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL no está definido}"
DOCUMENT_STORAGE_PATH="${DOCUMENT_STORAGE_PATH:-$APP_DIR/storage/documents}"

for command in pg_restore sha256sum tar; do
  command -v "$command" >/dev/null 2>&1 || { echo "ERROR: falta el comando $command" >&2; exit 1; }
done

printf 'Validando integridad SHA-256...\n'
(
  cd "$BACKUP_DIR"
  sha256sum -c SHA256SUMS
)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PREVIOUS_DOCS="${DOCUMENT_STORAGE_PATH}.pre-restore-$STAMP"

printf 'Restaurando PostgreSQL...\n'
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$BACKUP_DIR/database.dump"

printf 'Restaurando documentos...\n'
if [[ -d "$DOCUMENT_STORAGE_PATH" ]]; then
  mv "$DOCUMENT_STORAGE_PATH" "$PREVIOUS_DOCS"
fi
mkdir -p "$DOCUMENT_STORAGE_PATH"
if ! tar -C "$DOCUMENT_STORAGE_PATH" -xzf "$BACKUP_DIR/documents.tar.gz"; then
  rm -rf "$DOCUMENT_STORAGE_PATH"
  if [[ -d "$PREVIOUS_DOCS" ]]; then mv "$PREVIOUS_DOCS" "$DOCUMENT_STORAGE_PATH"; fi
  echo "ERROR: falló la restauración de documentos. Se repuso el directorio anterior." >&2
  exit 1
fi

printf 'Restauración completada.\n'
if [[ -d "$PREVIOUS_DOCS" ]]; then
  printf 'Copia previa de documentos conservada en: %s\n' "$PREVIOUS_DOCS"
fi
printf 'Recomendación: ejecuta prisma generate, inicia la aplicación y valida lotes/documentos antes de eliminar la copia previa.\n'
