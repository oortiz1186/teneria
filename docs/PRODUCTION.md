# Operación productiva en Ubuntu

Esta guía define la instalación recomendada de Tenería ERP como servicio systemd, con health check, backup previo a despliegues, rollback de código y despliegue manual protegido desde GitHub Actions.

## Arquitectura recomendada

- Código: `/opt/teneria/app`
- Usuario de servicio: `teneria`
- Documentos: `/var/lib/teneria/documents`
- Backups programados: `/var/backups/teneria`
- Aplicación: `127.0.0.1:3000`
- Exposición pública: reverse proxy o Cloudflare Tunnel
- Servicio: `teneria.service`
- Watchdog: cada 2 minutos
- Runner GitHub: self-hosted dedicado, usuario `teneria`, etiqueta `teneria-production`

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

sudo cp deploy/sudoers/teneria-deploy /etc/sudoers.d/teneria-deploy
sudo chmod 0440 /etc/sudoers.d/teneria-deploy
sudo visudo -cf /etc/sudoers.d/teneria-deploy

sudo chmod +x scripts/backup-teneria.sh scripts/restore-teneria.sh scripts/deploy-production.sh scripts/health-watch.sh
sudo systemctl daemon-reload
sudo systemctl enable --now teneria.service
sudo systemctl enable --now teneria-health.timer
sudo systemctl enable --now teneria-backup.timer
```

La regla `sudoers` sólo permite al usuario `teneria` ejecutar `systemctl restart teneria.service`; no concede sudo general.

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

Última versión de `main`:

```bash
cd /opt/teneria/app
sudo -u teneria env TENERIA_BACKUP_ROOT=/var/backups/teneria bash scripts/deploy-production.sh
```

Commit exacto aprobado:

```bash
cd /opt/teneria/app
sudo -u teneria env \
  TENERIA_BACKUP_ROOT=/var/backups/teneria \
  TENERIA_DEPLOY_SHA=<sha> \
  bash scripts/deploy-production.sh
```

Si se proporciona `TENERIA_DEPLOY_SHA`, el script verifica que el commit exista y sea ancestro de `origin/main`. No acepta desplegar un commit ajeno al historial productivo.

El script:

1. obtiene `origin/main`;
2. rechaza el despliegue si hay cambios locales;
3. resuelve y valida el commit exacto objetivo;
4. instala dependencias y genera Prisma;
5. ejecuta el build antes de tocar la base productiva;
6. crea backup de PostgreSQL + documentos;
7. aplica `prisma migrate deploy`;
8. reinicia `teneria.service`;
9. consulta `/api/health`;
10. si el health no se recupera, vuelve al commit anterior, reconstruye y reinicia.

### Advertencia de rollback

El rollback automático es **de código**, no de migraciones PostgreSQL. Por ello las migraciones productivas deben diseñarse de forma compatible hacia atrás (expand/contract). El backup previo al deploy es la vía de recuperación ante una migración destructiva y su restauración debe hacerse deliberadamente siguiendo `docs/BACKUPS.md`.

## 7. Watchdog

`teneria-health.timer` ejecuta el health check cada dos minutos. El script hace tres intentos; sólo si todos fallan reinicia `teneria.service`.

Esto evita reinicios por una falla transitoria única y deja registro en journald.

## 8. Deploy bajo demanda desde GitHub

El repositorio incluye `.github/workflows/deploy-production.yml`. Es un workflow **manual** (`workflow_dispatch`), no se ejecuta por cada push.

### 8.1 Crear el environment `production`

En GitHub, crear el environment llamado exactamente:

```text
production
```

Se recomienda configurar protección/aprobadores para que un despliegue requiera autorización explícita antes de ejecutarse.

El workflow declara `environment: production`, de modo que usa las reglas definidas allí.

### 8.2 Instalar un self-hosted runner dedicado

En GitHub abrir la configuración del repositorio, sección Actions / Runners, crear un runner Linux x64 y seguir **los comandos que GitHub genere en ese momento**. El token de registro es temporal y no debe copiarse al repositorio ni a documentación persistente.

Recomendaciones obligatorias para este servidor:

- instalar el runner como usuario `teneria`, nunca como `root`;
- ubicarlo fuera del código, por ejemplo `/opt/teneria/runner`;
- asignar la etiqueta adicional `teneria-production`;
- instalarlo como servicio para que vuelva tras reiniciar Ubuntu;
- no reutilizar este runner para proyectos no relacionados;
- no ejecutar workflows de `pull_request` sobre este runner.

El job productivo exige exactamente estas etiquetas:

```yaml
runs-on: [self-hosted, linux, x64, teneria-production]
```

La CI normal continúa ejecutándose en runners hospedados por GitHub; código de un pull request no debe ejecutarse en el servidor productivo.

### 8.3 Ejecutar un despliegue

En GitHub:

```text
Actions
→ Deploy production
→ Run workflow
```

El campo `commit` es opcional. Si se deja vacío, usa el commit desde el que se ejecutó el workflow. También se puede introducir explícitamente un SHA de `main`.

El workflow valida el SHA, pasa ese commit exacto a `scripts/deploy-production.sh` y registra en el Summary:

- usuario que solicitó el despliegue;
- commit solicitado;
- resultado;
- hostname del servidor;
- fecha UTC.

### 8.4 Concurrencia y seguridad

El workflow utiliza:

```yaml
concurrency:
  group: teneria-production
  cancel-in-progress: false
```

Por tanto, un segundo deploy espera al primero; nunca cancela una migración o despliegue que ya esté ejecutándose.

Los permisos del workflow están limitados a:

```yaml
permissions:
  contents: read
```

No necesita claves SSH, tokens de base de datos ni `AUTH_SECRET` dentro de GitHub: el deployment se ejecuta localmente en el servidor y utiliza `/opt/teneria/app/.env`.

El runner sí debe protegerse como infraestructura productiva, ya que cualquier workflow autorizado que se ejecute en él tiene acceso a los recursos disponibles para el usuario `teneria`.
