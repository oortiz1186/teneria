#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${TENERIA_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${TENERIA_DEPLOY_BRANCH:-main}"
REQUESTED_SHA="${TENERIA_DEPLOY_SHA:-}"
SERVICE="${TENERIA_SERVICE:-teneria.service}"
HEALTH_URL="${TENERIA_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_ATTEMPTS="${TENERIA_HEALTH_ATTEMPTS:-20}"
HEALTH_DELAY="${TENERIA_HEALTH_DELAY:-3}"
LOCK_FILE="${TENERIA_DEPLOY_LOCK:-/tmp/teneria-deploy.lock}"
HEALTH_FILE="${TENERIA_HEALTH_FILE:-/tmp/teneria-health.json}"

cd "$APP_DIR"

for command in git npm curl flock; do
  command -v "$command" >/dev/null 2>&1 || { echo "ERROR: falta $command" >&2; exit 1; }
done

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "ERROR: ya existe un despliegue en ejecución." >&2; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: el árbol de trabajo tiene cambios locales. No se desplegará." >&2
  git status --short >&2
  exit 1
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"
printf 'Versión actual: %s\n' "$PREVIOUS_SHA"

git fetch --prune origin "$BRANCH"
BRANCH_SHA="$(git rev-parse "origin/$BRANCH")"

if [[ -n "$REQUESTED_SHA" ]]; then
  # Aceptar SHA corto o largo sólo si Git puede resolverlo después del fetch.
  if ! TARGET_SHA="$(git rev-parse --verify "${REQUESTED_SHA}^{commit}" 2>/dev/null)"; then
    echo "ERROR: el commit solicitado no existe: $REQUESTED_SHA" >&2
    exit 1
  fi
  # Nunca desplegar un commit ajeno a la rama productiva autorizada.
  if ! git merge-base --is-ancestor "$TARGET_SHA" "origin/$BRANCH"; then
    echo "ERROR: $TARGET_SHA no pertenece al historial de origin/$BRANCH." >&2
    exit 1
  fi
else
  TARGET_SHA="$BRANCH_SHA"
fi

if [[ "$PREVIOUS_SHA" == "$TARGET_SHA" ]]; then
  echo "El servidor ya está en la versión solicitada: $TARGET_SHA"
  exit 0
fi

printf 'Rama autorizada: %s\n' "$BRANCH"
printf 'HEAD remoto: %s\n' "$BRANCH_SHA"
printf 'Objetivo exacto: %s\n' "$TARGET_SHA"
git reset --hard "$TARGET_SHA"

rollback_code() {
  echo "Health check falló. Revirtiendo código a $PREVIOUS_SHA..." >&2
  git reset --hard "$PREVIOUS_SHA"
  npm install --no-audit --no-fund
  npm run db:generate
  npm run build
  sudo systemctl restart "$SERVICE"
  echo "Rollback de código completado. IMPORTANTE: las migraciones de BD no se revierten automáticamente." >&2
}

printf 'Instalando dependencias...\n'
npm install --no-audit --no-fund
npm run db:generate

printf 'Construyendo versión productiva...\n'
npm run build

printf 'Creando respaldo previo al deploy...\n'
bash scripts/backup-teneria.sh

printf 'Aplicando migraciones pendientes...\n'
npx prisma migrate deploy

printf 'Reiniciando %s...\n' "$SERVICE"
sudo systemctl restart "$SERVICE"

printf 'Validando health check...\n'
for ((i=1; i<=HEALTH_ATTEMPTS; i++)); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >"$HEALTH_FILE"; then
    printf 'Deploy correcto: %s\n' "$TARGET_SHA"
    cat "$HEALTH_FILE"
    printf '\n'
    exit 0
  fi
  sleep "$HEALTH_DELAY"
done

rollback_code
exit 1
