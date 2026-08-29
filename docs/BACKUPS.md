# Respaldos y restauración

El ERP necesita respaldar dos componentes juntos:

1. PostgreSQL.
2. `DOCUMENT_STORAGE_PATH`, donde viven fotografías, XML, PDF y demás adjuntos.

Los scripts incluidos generan un directorio por respaldo con:

- `database.dump` — `pg_dump` en formato custom;
- `documents.tar.gz` — documentos comprimidos;
- `manifest.txt` — fecha, host, tamaños y hashes;
- `SHA256SUMS` — verificación de integridad antes de restaurar.

## Requisitos Ubuntu

Instala el cliente de PostgreSQL si el servidor no tiene `pg_dump`/`pg_restore`:

```bash
sudo apt update
sudo apt install postgresql-client
```

## Prueba manual

Desde el proyecto:

```bash
bash scripts/backup-teneria.sh
```

Por defecto crea respaldos en `./backups` y conserva 14 días.

Variables opcionales:

```env
TENERIA_BACKUP_ROOT=/var/backups/teneria
TENERIA_BACKUP_RETENTION_DAYS=14
```

Estas variables pueden definirse en el servicio de systemd; no es necesario agregarlas al `.env` de Next.js.

## Automatización con systemd

Los archivos base están en `deploy/systemd/` y suponen:

- aplicación: `/opt/teneria`;
- usuario de servicio: `teneria`;
- documentos: `/var/lib/teneria/documents`;
- respaldos: `/var/backups/teneria`.

Ajusta las rutas si tu despliegue utiliza otras ubicaciones.

```bash
sudo mkdir -p /var/backups/teneria
sudo chown -R teneria:teneria /var/backups/teneria
sudo cp deploy/systemd/teneria-backup.service /etc/systemd/system/
sudo cp deploy/systemd/teneria-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teneria-backup.timer
```

Verifica:

```bash
systemctl list-timers teneria-backup.timer
sudo systemctl start teneria-backup.service
sudo systemctl status teneria-backup.service
journalctl -u teneria-backup.service -n 100 --no-pager
```

El timer está configurado a las 02:30 con retraso aleatorio de hasta 10 minutos para evitar concentrar I/O exactamente a la misma hora.

## Restauración

La restauración destruye/reemplaza datos de la base objetivo. Primero realiza un respaldo nuevo del estado actual y detén la aplicación para evitar escrituras mientras restauras.

```bash
sudo systemctl stop teneria
```

Si la aplicación se ejecuta con PM2, detén el proceso correspondiente en lugar del comando anterior.

Luego:

```bash
CONFIRM_RESTORE=YES bash scripts/restore-teneria.sh /var/backups/teneria/20260829T023000Z
```

El script:

1. valida `SHA256SUMS`;
2. restaura PostgreSQL mediante `pg_restore --clean --if-exists`;
3. mueve el directorio actual de documentos a una copia `.pre-restore-...`;
4. extrae los documentos del respaldo;
5. conserva temporalmente la copia anterior para recuperación manual.

Después:

```bash
npm run db:generate
# iniciar nuevamente el servicio o PM2
```

Valida inicio de sesión, lotes, calidad, documentos, compras, finanzas y mantenimiento antes de borrar la copia previa de documentos.

## Copia fuera del servidor

Un respaldo guardado únicamente en el mismo disco no protege contra falla total del servidor, robo o corrupción del almacenamiento. Se recomienda sincronizar `/var/backups/teneria` a un segundo destino: NAS, disco externo montado, servidor remoto o almacenamiento de objetos.

No subas respaldos a GitHub: pueden contener datos empresariales, documentos fiscales y otra información privada.

## Prueba de restauración

La existencia del archivo no garantiza que el respaldo sea recuperable. Como operación periódica, restaura un respaldo reciente en una base y directorio de prueba y valida el ERP. Mantén registro de la fecha de la última restauración probada.
