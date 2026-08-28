# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fases 1 a 8
Estado: completadas en su alcance inicial.

Incluyen recepción/lotes, producción, inventarios/químicos/recetas, calidad, comercial, compras/administración, costos/contabilidad, dashboard ejecutivo, operación de piso y auditoría operacional.

### Endurecimiento para producción — Etapa 2
Estado: avanzado.

Implementado:

- login obligatorio para acceder al ERP;
- sesión firmada con `AUTH_SECRET` y duración de 8 horas;
- cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- autorización por roles ADMIN, PRODUCTION, WAREHOUSE, QUALITY, SALES, PURCHASING y FINANCE;
- credenciales individuales con hash bcrypt en PostgreSQL;
- `sessionVersion` para revocar sesiones tras cambios de seguridad;
- último acceso por usuario;
- administración de usuarios/roles desde `/configuracion`;
- activación, desactivación, cambio de roles y restablecimiento de contraseña;
- cambio de contraseña por el propio usuario desde `/cuenta`, validando su contraseña actual y revocando las sesiones anteriores;
- auditoría persistente `AuditLog` con usuario, correo, acción, entidad, antes/después, IP, navegador y fecha;
- auditoría en usuarios, recepción de piel, ventas, compras, finanzas, producción, órdenes de producción, calidad, inventario, recetas, consumos químicos, costos, máquinas y genealogía de lotes;
- `/auditoria` con auditoría real por usuario y cronología operacional;
- todas las `server actions` operativas del ERP protegidas mediante usuario/rol correspondiente;
- folios resistentes a colisión en los flujos endurecidos;
- compuerta de calidad: QUALITY deja el lote en espera hasta liberación explícita;
- producto terminado sólo se registra tras liberación de Calidad;
- estado `CONSUMED` para lotes absorbidos por una fusión;
- división de lote bloqueada durante procesos activos;
- división copia al lote hijo los pasos pendientes de la ruta;
- fusión bloqueada durante procesos activos y exige misma orden, etapa, artículo, color y ruta pendiente;
- pasos pendientes del lote absorbido se cancelan tras una fusión válida;
- cierre de orden trata `COMPLETED`, `REJECTED`, `CANCELLED` y `CONSUMED` como estados terminales;
- consumo químico con decremento atómico y bloqueo de existencias negativas ante solicitudes concurrentes;
- recetas activas filtradas por vigencia al registrar consumos;
- control de unidad para porcentajes sobre peso en recetas;
- cobros CxC y pagos CxP con decremento atómico de saldo y rechazo de pagos concurrentes inválidos;
- inicio de procesos con bloqueo de fila del lote y toma atómica de máquina;
- cierre de procesos con bloqueo de ejecución para evitar doble cierre;
- recepción de órdenes de compra serializada por partida para evitar sobre-recepciones concurrentes;
- lotes químicos recibidos mediante `upsert` para impedir duplicados del mismo lote/proveedor/almacén;
- recepción manual de químicos consolidada por químico/almacén/lote;
- estados de máquina validados: no puede enviarse a mantenimiento una máquina en uso ni liberarse una que no esté en mantenimiento;
- asignación de lotes a órdenes de producción bloqueada para lotes cerrados o con proceso activo;
- seed seguro: no elimina pasos de rutas existentes y no vuelve a sobrescribir una contraseña de administrador ya inicializada;
- CI de GitHub Actions con Prisma Validate, Prisma Generate y TypeScript;
- esquema Prisma corregido a sintaxis válida de enums y verificado por CI.

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

Los cambios de usuarios/auditoría y el estado `CONSUMED` sí requieren migración. Los cambios posteriores de concurrencia, permisos, auditoría adicional y cambio de contraseña no agregan tablas nuevas.

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name hardening_users_audit_lots
npm run db:seed
npm run dev
```

Si ya aplicaste `hardening_users_audit_lots`, basta con:

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

El administrador bootstrap recibe `ADMIN` al ejecutar `npm run db:seed`. Después puedes crear cuentas individuales desde Configuración.

## Flujo integral actual

Recepción → Lote → Pedido/Orden de producción → Ruta → Máquina/Proceso → Receta → Consumo químico → Calidad → Producto terminado → Remisión → CxC → Cobro → Costeo/Margen → Cola contable.

Compras:

Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

## Próximos pasos de endurecimiento

1. pruebas de integración concurrente contra PostgreSQL real;
2. recuperación controlada de acceso para usuarios que olviden su contraseña;
3. auditoría atómica dentro de las mismas transacciones críticas;
4. órdenes de mantenimiento preventivo/correctivo y refacciones;
5. almacenamiento real de fotografías/PDF/XML;
6. PWA/offline para piso;
7. worker Windows para CONTPAQi;
8. backups automáticos y restauración probada;
9. monitoreo y alertas de infraestructura/aplicación;
10. despliegue productivo reproducible.
