# Operación productiva en Ubuntu

Esta guía define la instalación recomendada de Tenería ERP como servicio systemd, con health check, backup previo a despliegues y rollback de código.

## Arquitectura recomendada

- Código: `/opt/teneria/app`
- Usuario de servicio: `teneria`
- Documentos: `/var/lib/teneria/documents`
- Backups programados: `/var/backups/teneria`
- Aplicación: `127.0.0.1:3000`
- Exposición pública: reverse proxy o Cloudflare Tunnel
- Servicio: `teneria.service`
- Watchdog: cada 2 minutos

No se recomienda publicar el puerto 3000 directamente a Internet.

## 1. Usuario y directorios

```bash
sudo useradd --system --create-home --shell /bin/bash teneria || true
sudo mkdir -p /opt/teneria /var/lib/teneria/documents /var/backups/teneria
sudo chown -R teneria:teneria /opt/teneria /var/lib/teneria /var/backups/teneria
sudo chmod 750 /var/lib/teneria/documents /var/backups/teneria
```

Clonar el repositorio:

```bash
sudo -u teneria git clone https://github.com/oortiz1186/teneria.git /opt/teneria/app
cd /opt/teneria/app
```

Node.js 22, npm, PostgreSQL client (`pg_dump`/`pg_restore`), Git y curl deben estar instalados.

## 2. Variables de entorno

Crear `/opt/teneria/app/.env` y protegerlo:

```bash
sudo -u teneria cp /opt/teneria/app/.env.example /opt/teneria/app/.env
sudo chmod 600 /opt/teneria/app/.env
```

Configurar como mínimo:

```env
DATABASE_URL="postgresql://usuario:password@host:5432/teneria?schema=public"
NEXT_PUBLIC_APP_URL="https://erp.tudominio.com"
AUTH_SECRET="secreto-aleatorio-de-mas-de-32-caracteres"
AUTH_BOOTSTRAP_EMAIL="admin@empresa.com"
AUTH_BOOTSTRAP_PASSWORD="password-inicial-seguro"
AUTH_BOOTSTRAP_NAME="Administrador"
DOCUMENT_STORAGE_PATH="/var/lib/teneria/documents"
DOCUMENT_MAX_BYTES="15728640"
```

## 3. Primera instalación

```bash
cd /opt/teneria/app
sudo -u teneria npm install --no-audit --no-fund
sudo -u teneria npm run db:generate
sudo -u teneria npx prisma migrate deploy
sudo -u teneria npm run db:seed
sudo -u teneria npm run build
```

## 4. Instalar systemd

```bash
sudo cp deploy/systemd/teneria.service /etc/systemd/system/
sudo cp deploy/systemd/teneria-health.service /etc/systemd/system/
sudo cp deploy/systemd/teneria-health.timer /etc/systemd/system/
sudo cp deploy/systemd/teneria-backup.service /etc/systemd/system/
sudo cp deploy/systemd/teneria-backup.timer /etc/systemd/system/

sudo chmod +x scripts/backup-teneria.sh scripts/restore-teneria.sh scripts/deploy-production.sh scripts/health-watch.sh
sudo systemctl daemon-reload
sudo systemctl enable --now teneria.service
sudo systemctl enable --now teneria-health.timer
sudo systemctl enable --now teneria-backup.timer
```

Comprobar:

```bash
systemctl status teneria.service --no-pager
systemctl list-timers 'teneria-*'
curl -fsS http://127.0.0.1:3000/api/health
```

Una respuesta sana devuelve HTTP 200 y `status: "ok"`.

## 5. Logs

Aplicación:

```bash
journalctl -u teneria.service -f
```

Watchdog:

```bash
journalctl -u teneria-health.service --since today
journalctl -t teneria-health --since today
```

Backup:

```bash
journalctl -u teneria-backup.service --since today
ls -lah /var/backups/teneria
```

## 6. Despliegue manual seguro

El servidor productivo debe mantener su árbol Git limpio.

```bash
cd /opt/teneria/app
sudo -u teneria env TENERIA_BACKUP_ROOT=/var/backups/teneria bash scripts/deploy-production.sh
```

El script:

1. obtiene `origin/main`;
2. rechaza el despliegue si hay cambios locales;
3. instala dependencias y genera Prisma;
4. ejecuta el build antes de tocar la base productiva;
5. crea backup de PostgreSQL + documentos;
6. aplica `prisma migrate deploy`;
7. reinicia `teneria.service`;
8. consulta `/api/health`;
9. si el health no se recupera, vuelve al commit anterior, reconstruye y reinicia.

### Advertencia de rollback

El rollback automático es **de código**, no de migraciones PostgreSQL. Por ello las migraciones productivas deben diseñarse de forma compatible hacia atrás (expand/contract). El backup previo al deploy es la vía de recuperación ante una migración destructiva y su restauración debe hacerse deliberadamente siguiendo `docs/BACKUPS.md`.

## 7. Watchdog

`teneria-health.timer` ejecuta el health check cada dos minutos. El script hace tres intentos; sólo si todos fallan reinicia `teneria.service`.

Esto evita reinicios por una falla transitoria única y deja registro en journald.

## 8. Deploy bajo demanda desde GitHub

La forma más segura es instalar posteriormente un GitHub Actions self-hosted runner dedicado al servidor y limitarlo a un environment protegido. No se deben guardar claves SSH privadas dentro del repositorio ni exponer un webhook de despliegue sin autenticación.

Hasta instalar ese runner, `scripts/deploy-production.sh` es el mecanismo oficial de despliegue.
