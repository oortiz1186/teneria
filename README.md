# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fases 1 a 8
Estado: completadas en su alcance inicial.

Incluyen recepción/lotes, producción, inventarios/químicos/recetas, calidad, comercial, compras/administración, costos/contabilidad, dashboard ejecutivo, operación de piso y auditoría operacional.

### Endurecimiento para producción — Etapa 2
Estado: en progreso.

Implementado:

- login obligatorio para acceder al ERP;
- sesión firmada con `AUTH_SECRET`;
- cookie de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- duración de sesión de 8 horas;
- autorización de rutas por roles ADMIN, PRODUCTION, WAREHOUSE, QUALITY, SALES, PURCHASING y FINANCE;
- helpers `requireUser` y `requireRole` para server actions;
- credenciales individuales almacenadas como hash bcrypt en PostgreSQL;
- `sessionVersion` por usuario para invalidar sesiones tras cambios de seguridad;
- fecha del último acceso;
- administración de usuarios desde `/configuracion`;
- alta de usuarios con uno o varios roles;
- activación/desactivación de cuentas;
- cambio de roles con revocación de sesiones anteriores;
- restablecimiento de contraseña con revocación de sesiones anteriores;
- bloqueo para impedir que un administrador se desactive a sí mismo desde la pantalla de usuarios;
- auditoría persistente `AuditLog` con usuario, correo, acción, entidad, antes/después, IP, navegador y fecha;
- `/auditoria` ahora muestra auditoría real por usuario además de la cronología operacional;
- ventas, compras y finanzas protegidas por rol y con validaciones reforzadas;
- compuerta de calidad: finalizar QUALITY ya no libera producto terminado automáticamente; la liberación ocurre tras aprobación explícita;
- seed de ruta productiva seguro: ya no elimina todos los pasos al ejecutarse;
- folios resistentes a colisión en los flujos endurecidos;
- CI de GitHub Actions con Prisma Validate, Prisma Generate y TypeScript.

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

`AUTH_BOOTSTRAP_PASSWORD` se usa durante el seed para crear/actualizar el administrador inicial y se almacena en PostgreSQL únicamente como hash bcrypt. No uses los valores de ejemplo en producción y nunca subas `.env` al repositorio.

## Actualizar una instalación existente

Esta etapa sí modifica el esquema de Prisma:

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name hardening_users_audit
npm run db:seed
npm run dev
```

Abrir:

- `http://localhost:3000/login` — Inicio de sesión
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

1. ampliar `AuditLog` a todas las acciones operativas críticas, no sólo seguridad/usuarios;
2. proteger las server actions restantes con `requireRole`;
3. reemplazar los folios timestamp restantes por el generador robusto;
4. concurrencia transaccional en inventario químico, pagos y procesos;
5. endurecer división/fusión de lotes y estados terminales;
6. cambio de contraseña por el propio usuario y recuperación controlada;
7. órdenes de mantenimiento preventivo/correctivo y refacciones;
8. almacenamiento real de fotografías/PDF/XML;
9. PWA/offline para piso;
10. worker Windows para CONTPAQi, backups, monitoreo y despliegue productivo.
