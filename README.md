# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fases 1 a 8
Estado: completadas en su alcance inicial.

Incluyen recepción/lotes, producción, inventarios/químicos/recetas, calidad, comercial, compras/administración, costos/contabilidad, dashboard ejecutivo, operación de piso y auditoría operacional.

### Endurecimiento para producción — Etapa 2
Estado: avanzado y validado contra PostgreSQL real.

Implementado:

- login obligatorio, sesiones firmadas de 8 horas y cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- autorización por roles ADMIN, PRODUCTION, WAREHOUSE, QUALITY, SALES, PURCHASING y FINANCE;
- credenciales individuales con hash bcrypt en PostgreSQL;
- `sessionVersion` para revocar sesiones tras cambios de seguridad;
- administración de usuarios/roles desde `/configuracion`;
- alta, activación/desactivación, cambio de roles y restablecimiento de contraseña;
- las contraseñas creadas/restablecidas por un administrador son temporales (`mustChangePassword=true`);
- un usuario con contraseña temporal sólo puede acceder a `/cuenta` hasta sustituirla;
- cambio de contraseña por el propio usuario desde `/cuenta`, validando la actual y revocando sesiones previas;
- auditoría persistente `AuditLog` con usuario, correo, acción, entidad, antes/después, IP, navegador y fecha;
- auditoría en recepción de piel, usuarios, ventas, compras, finanzas, producción, órdenes de producción, calidad, inventario, recetas, consumos químicos, costos, máquinas y genealogía de lotes;
- todas las `server actions` operativas protegidas mediante usuario/rol; el login es la única acción pública por diseño;
- folios resistentes a colisión en los flujos endurecidos;
- compuerta de Calidad antes de producto terminado;
- estado `CONSUMED` para lotes absorbidos por una fusión;
- división/fusión de lotes protegida por estado, proceso, orden, etapa, artículo, color y ruta;
- consumo químico con decremento atómico y bloqueo de existencias negativas;
- cobros CxC y pagos CxP con decremento atómico de saldo;
- inicio de proceso con bloqueo de lote y toma atómica de máquina;
- cierre de proceso protegido contra doble cierre;
- recepción de OC serializada por partida;
- lotes químicos por `upsert` para evitar duplicados concurrentes;
- estados de máquina validados para mantenimiento/liberación;
- seed seguro: no elimina pasos de rutas ni reemplaza contraseñas existentes;
- esquema Prisma normalizado y validado;
- CI con PostgreSQL 16 real, Prisma Validate, Prisma Generate, TypeScript, `prisma db push`, seed y pruebas de integración concurrente.

## Validación automática

El workflow de GitHub Actions levanta PostgreSQL 16 y ejecuta:

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npx prisma db push --skip-generate
npm run db:seed
npm run test:integration
```

`npm run test:integration` valida actualmente tres escenarios concurrentes críticos:

1. dos consumos simultáneos sobre el mismo lote químico: sólo uno puede descontar si el saldo no alcanza para ambos;
2. dos cobros simultáneos sobre una misma CxC: sólo uno puede aplicar si el saldo no alcanza para ambos;
3. dos intentos simultáneos de tomar una misma máquina disponible: sólo uno puede ganar.

La primera ejecución completa con PostgreSQL real pasó correctamente todas las etapas.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Configuración inicial

Copia `.env.example` a `.env` y cambia todos los secretos:

```env
DATABASE_URL="postgresql://teneria:teneria_dev@localhost:5434/teneria?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_SECRET="genera-un-secreto-aleatorio-de-mas-de-32-caracteres"
AUTH_BOOTSTRAP_EMAIL="tu-admin@empresa.com"
AUTH_BOOTSTRAP_PASSWORD="una-contrasena-unica-de-minimo-12-caracteres"
AUTH_BOOTSTRAP_NAME="Administrador"
```

`AUTH_BOOTSTRAP_PASSWORD` sólo inicializa la contraseña si el administrador todavía no existe o no tiene hash. Después, ejecutar nuevamente el seed no reemplaza su contraseña. Nunca subas `.env` al repositorio.

## Actualizar una instalación existente

Los cambios de usuarios/auditoría y el estado `CONSUMED` sí requieren migración. Los cambios posteriores de concurrencia, permisos, contraseña temporal y pruebas no agregan tablas nuevas.

Si aún no aplicaste la migración de endurecimiento:

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name hardening_users_audit_lots
npm run db:seed
npm run dev
```

Si ya aplicaste `hardening_users_audit_lots`:

```bash
git pull
npm install
npm run db:generate
npm run dev
```

Abrir:

- `http://localhost:3000/login` — Inicio de sesión
- `http://localhost:3000/cuenta` — Mi cuenta / cambiar contraseña
- `http://localhost:3000/configuracion` — Usuarios y roles
- `http://localhost:3000/auditoria` — Auditoría por usuario + cronología operacional
- `http://localhost:3000` — Dashboard ejecutivo
- `http://localhost:3000/operacion` — Piso / operación
- `http://localhost:3000/costos` — Costos y margen

## Roles

- `ADMIN`: acceso total y configuración/auditoría.
- `PRODUCTION`: producción, rutas, lotes y consumos relacionados.
- `WAREHOUSE`: recepciones, almacenes e inventarios.
- `QUALITY`: calidad, lotes y operación relacionada.
- `SALES`: clientes, cotizaciones, pedidos y remisiones.
- `PURCHASING`: requisiciones, órdenes de compra y recepción.
- `FINANCE`: CxC, CxP, pagos, gastos y costos.

## Flujo integral actual

Recepción → Lote → Pedido/Orden de producción → Ruta → Máquina/Proceso → Receta → Consumo químico → Calidad → Producto terminado → Remisión → CxC → Cobro → Costeo/Margen → Cola contable.

Compras: Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

## Próximos pasos de endurecimiento

1. auditoría atómica dentro de las mismas transacciones críticas;
2. órdenes de mantenimiento preventivo/correctivo y refacciones;
3. almacenamiento real de fotografías/PDF/XML;
4. PWA/offline para piso;
5. worker Windows para CONTPAQi;
6. backups automáticos y restauración probada;
7. monitoreo y alertas de infraestructura/aplicación;
8. despliegue productivo reproducible.
