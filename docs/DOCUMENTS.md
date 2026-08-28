# Gestión documental

La gestión documental del ERP usa metadatos en PostgreSQL (`DocumentAttachment`) y archivos físicos fuera del repositorio.

## Configuración recomendada en Ubuntu

```bash
sudo mkdir -p /var/lib/teneria/documents
sudo chown -R $USER:$USER /var/lib/teneria/documents
chmod 750 /var/lib/teneria/documents
```

En `.env`:

```env
DOCUMENT_STORAGE_PATH="/var/lib/teneria/documents"
DOCUMENT_MAX_BYTES="15728640"
```

`DOCUMENT_MAX_BYTES=15728640` equivale a 15 MB por archivo.

## Formatos permitidos

- JPG
- PNG
- WEBP
- PDF
- XML

Los archivos reciben un nombre interno aleatorio, se organizan por año/mes y se calcula SHA-256 al subirlos. El nombre original sólo se conserva como metadato.

## Seguridad

Los archivos no se exponen como archivos estáticos. La descarga pasa por `/api/documents/[id]`, verifica sesión, estado del usuario, rol y entidad relacionada.

Los permisos dependen del tipo de documento: lotes, calidad, mantenimiento, compras, finanzas o ventas. ADMIN conserva acceso total.

Las subidas y eliminaciones generan `AuditLog` con usuario y metadatos del archivo. El borrado es lógico en PostgreSQL y elimina el archivo físico.

## Centro documental

Abrir `/documentos` para relacionar archivos con:

- lote;
- inspección de calidad;
- orden de mantenimiento;
- factura de proveedor;
- cuenta por cobrar;
- recepción de piel;
- orden de compra;
- pedido de venta.

## Migración

Después de actualizar el repositorio:

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name document_storage
npm run dev
```

Los campos heredados `QualityEvidence.fileUrl`, `SupplierInvoice.xmlUrl/pdfUrl` y `AccountReceivable.xmlUrl/pdfUrl` se conservan por compatibilidad. No deben usarse para nuevas cargas; una migración posterior podrá importar esas referencias a `DocumentAttachment` cuando existan archivos históricos accesibles.

## Backup

El respaldo debe incluir tanto PostgreSQL como `DOCUMENT_STORAGE_PATH`. Restaurar sólo uno de los dos deja metadatos o archivos huérfanos.
