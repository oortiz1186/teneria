# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fases 1 a 8
Estado: completadas en su alcance inicial.

Incluyen recepción/lotes, producción, inventarios/químicos/recetas, calidad, comercial, compras/administración, costos/contabilidad, dashboard ejecutivo, operación de piso y auditoría operacional.

### Endurecimiento para producción — Etapa 1
Estado: en progreso, primera pasada implementada.

Implementado:

- login obligatorio para acceder al ERP;
- sesión firmada con `AUTH_SECRET`;
- cookie de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- duración de sesión de 8 horas;
- autorización de rutas por roles ADMIN, PRODUCTION, WAREHOUSE, QUALITY, SALES, PURCHASING y FINANCE;
- helpers de servidor `requireUser` y `requireRole` para proteger acciones sensibles;
- ventas protegidas por rol y validaciones adicionales Pedido → Lote → Remisión;
- compras protegidas por rol;
- recepción de químicos con validación de cantidades pendientes y almacén obligatorio;
- movimientos de inventario enlazados al lote químico recibido;
- finanzas protegidas por rol;
- validaciones de cliente/pedido/remisión en CxC;
- bloqueo de pagos/cobros sobre documentos cerrados;
- folios resistentes a colisión basados en fecha + UUID para nuevos flujos endurecidos;
- pantalla de login y cierre de sesión;
- administrador inicial configurable sólo por variables de entorno;
- CI de GitHub Actions para validar Prisma y TypeScript en cada push/PR.

La autenticación inicial usa un administrador bootstrap configurado en el entorno. No existe una contraseña fija dentro del repositorio. La siguiente evolución será administrar credenciales individuales por usuario, cambio de contraseña, recuperación y auditoría de sesión.

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

No uses los valores de ejemplo en producción y nunca subas `.env` al repositorio.

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:seed
npm run dev
```

Si todavía no aplicaste las migraciones de las fases anteriores, ejecuta también las migraciones pendientes antes del seed.

Abrir:

- `http://localhost:3000/login` — Inicio de sesión
- `http://localhost:3000` — Dashboard ejecutivo
- `http://localhost:3000/operacion` — Piso / operación
- `http://localhost:3000/auditoria` — Auditoría operacional
- `http://localhost:3000/costos` — Costos y margen

## Roles

- `ADMIN`: acceso total y configuración/auditoría.
- `PRODUCTION`: producción, rutas, lotes y consumos relacionados.
- `WAREHOUSE`: recepciones, almacenes e inventarios.
- `QUALITY`: calidad, lotes y operación relacionada.
- `SALES`: clientes, cotizaciones, pedidos y remisiones.
- `PURCHASING`: requisiciones, órdenes de compra y recepción.
- `FINANCE`: CxC, CxP, pagos, gastos y costos.

El usuario administrador bootstrap recibe el rol `ADMIN` al ejecutar `npm run db:seed`.

## Flujo integral actual

Recepción → Lote → Pedido/Orden de producción → Ruta → Máquina/Proceso → Receta → Consumo químico → Calidad → Producto terminado → Remisión → CxC → Cobro → Costeo/Margen → Cola contable.

Compras:

Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

## Próximos pasos de endurecimiento

1. credenciales individuales con hash por usuario y administración de usuarios;
2. auditoría before/after con usuario, IP y origen;
3. proteger todas las server actions restantes con `requireRole`;
4. reemplazar los folios timestamp restantes por el generador robusto;
5. pruebas de concurrencia en inventario, lotes, pagos y procesos;
6. órdenes de mantenimiento preventivo/correctivo y refacciones;
7. almacenamiento real de fotografías/PDF/XML;
8. PWA/offline para piso;
9. worker Windows para CONTPAQi;
10. backups, monitoreo y despliegue productivo.
