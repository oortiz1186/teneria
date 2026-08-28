# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fases 1 a 7
Estado: completadas en su alcance inicial.

Incluyen recepción y lotes, producción, inventarios/químicos/recetas, calidad, comercial, compras/administración y costos/contabilidad.

### Fase 8 — Indicadores y piso
Estado: completada en su alcance inicial.

Implementado:

- dashboard ejecutivo con KPIs de producción;
- lotes en proceso y terminados;
- órdenes de producción activas y vencidas;
- alertas de inventario mínimo;
- equipos en mantenimiento;
- CxC y CxP pendientes;
- costo acumulado y margen comercial;
- accesos rápidos a módulos operativos;
- módulo `/operacion` optimizado para piso;
- procesos activos por lote, máquina e inicio;
- disponibilidad de máquinas;
- envío básico de equipo a mantenimiento y liberación;
- alertas de inventario para operación;
- indicadores ambientales iniciales basados en registros WATER y ENERGY del costeo;
- actividad reciente de movimientos de lote;
- vista `/auditoria` con cronología consolidada de producción, inventario, calidad y finanzas;
- navegación responsive para tablet y celular;
- menú móvil horizontal persistente;
- tablas con desplazamiento horizontal en pantallas pequeñas;
- tarjetas y formularios adaptables a móvil.

La auditoría actual consolida los eventos ya registrados por los módulos. La auditoría avanzada de usuario, IP y valores antes/después se implementará junto con autenticación/autorización completa.

El mantenimiento de esta fase controla disponibilidad y estado básico del equipo. Órdenes de mantenimiento, refacciones, técnicos, calendario preventivo y costos de mantenimiento pueden agregarse en una fase posterior de endurecimiento operativo.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

Si ya aplicaste la migración de Fase 7, esta fase no agrega tablas nuevas:

```bash
git pull
npm install
npm run db:generate
npm run dev
```

Si todavía no has aplicado Fase 7:

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase7_costos_contabilidad
npm run db:seed
npm run dev
```

Abrir:

- `http://localhost:3000` — Dashboard ejecutivo
- `http://localhost:3000/operacion` — Piso / operación
- `http://localhost:3000/auditoria` — Auditoría operacional
- `http://localhost:3000/costos` — Costos y margen

Configurar en `.env` la URL pública usada por los QR cuando el sistema se despliegue:

```env
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

## Flujo integral actual

Recepción → Lote → Pedido/Orden de producción → Ruta → Máquina/Proceso → Receta → Consumo químico → Calidad → Producto terminado → Remisión → CxC → Cobro → Costeo/Margen → Cola contable.

Compras:

Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

## Siguiente etapa recomendada

Con las ocho fases iniciales cubiertas, el siguiente trabajo ya no debería ser agregar módulos indiscriminadamente, sino endurecer el ERP para uso real:

1. autenticación y permisos reales por rol;
2. auditoría antes/después por usuario;
3. pruebas automáticas y validación de concurrencia;
4. folios transaccionales robustos;
5. órdenes de mantenimiento preventivo/correctivo;
6. carga real de fotografías/documentos;
7. PWA/offline para piso;
8. worker Windows para CONTPAQi;
9. despliegue productivo, backups y monitoreo;
10. ajuste de catálogos, rutas y recetas con el proceso real de la tenería.
