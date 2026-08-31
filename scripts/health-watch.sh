#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${TENERIA_SERVICE:-teneria.service}"
HEALTH_URL="${TENERIA_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
ATTEMPTS="${TENERIA_HEALTH_ATTEMPTS:-3}"
DELAY="${TENERIA_HEALTH_DELAY:-5}"

for ((i=1; i<=ATTEMPTS; i++)); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
    exit 0
  fi
  sleep "$DELAY"
done

logger -t teneria-health "Health check falló tras $ATTEMPTS intentos; reiniciando $SERVICE"
systemctl restart "$SERVICE"
