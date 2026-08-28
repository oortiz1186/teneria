# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fase 1 — Base + recepción/lotes
Estado: completada.

Incluye PostgreSQL propio con Docker, usuarios/roles, proveedores/clientes, almacenes, recepción de piel, creación automática de lote, catálogo de procesos, movimientos y dashboard inicial.

### Fase 2 — Producción
Estado: completada en su alcance inicial.

Implementado:

- catálogo de bombos y máquinas;
- estados y capacidad por máquina;
- órdenes de producción;
- asignación de lotes a órdenes;
- rutas configurables de producción;
- ruta estándar de ciclo completo precargada;
- generación automática de pasos al asignar un lote;
- validación del siguiente proceso permitido;
- inicio y cierre de procesos;
- peso/pieles de entrada y salida;
- pH, temperatura y observaciones;
- control de ocupación/liberación de máquinas;
- historial de procesos y merma;
- división de lotes;
- mezcla de lotes;
- genealogía muchos-a-muchos de lotes;
- QR único por lote;
- ficha de trazabilidad integral;
- movimientos PROCESS_IN / PROCESS_OUT / SPLIT / MERGE;
- cierre automático de lote al terminar la ruta;
- envío automático a almacén de producto terminado;
- cierre automático de la orden cuando terminan todos sus lotes.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase2_rutas_genealogia_qr
npm run db:seed
npm run dev
```

Abrir:

http://localhost:3000

Configurar en `.env` la URL pública usada por los QR cuando el sistema se despliegue:

```env
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

## Flujo actual

Recepción → Lote → Orden de producción → Ruta → Proceso/Máquina → Control de salida → Siguiente proceso → Calidad → Producto terminado.

El `TanneryLot` sigue siendo el centro de la trazabilidad. `LotRelation` conserva la genealogía cuando los lotes se dividen, mezclan o posteriormente se reprocesen.

## Roadmap

### Fase 3 — Inventario y químicos
- catálogo de químicos y materiales
- unidades de medida
- lotes y caducidad
- entradas/salidas y existencias
- recetas/versiones
- consumo real vs teórico
- mínimos y alertas
- consumo por lote/proceso

### Fase 4 — Calidad
- inspecciones
- defectos
- clasificación
- rechazo
- reproceso
- evidencia/fotos

### Fase 5 — Comercial
- clientes
- cotizaciones
- pedidos
- listas de precios
- remisiones
- facturación / integración CONTPAQi

### Fase 6 — Compras y administración
- requisiciones
- órdenes de compra
- facturas de proveedor
- CxP
- CxC
- pagos
- gastos

### Fase 7 — Costos y contabilidad
- costo por lote
- piel
- químicos
- mano de obra
- agua/energía
- merma/reproceso
- margen por pedido/cliente/artículo
- interfaz con CONTPAQi Contabilidad

### Fase 8 — Indicadores y piso
- dashboards
- interfaz optimizada para tablet/celular
- alertas
- auditoría
- mantenimiento
- indicadores ambientales
