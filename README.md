# Tenería ERP — Fase 1

Base inicial de un ERP especializado para operación de tenerías.

## Alcance implementado

- PostgreSQL propio con Docker.
- Modelo de usuarios y roles.
- Proveedores y clientes.
- Almacenes.
- Recepción de piel.
- Creación automática de lote desde recepción.
- Jerarquía de lotes para futuras divisiones y mezclas.
- Catálogo de procesos de tenería.
- Ejecución de procesos por lote.
- Movimientos de lote/almacén.
- Dashboard inicial.
- Pantalla de recepción.
- Listado de lotes.
- Módulos futuros ya separados en navegación.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Arranque local

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Abrir:

http://localhost:3000

## Decisiones de arquitectura

El `TanneryLot` es el centro de la trazabilidad. No se modeló el sistema alrededor de facturas ni pedidos porque el mayor riesgo operativo de una tenería está en perder la genealogía y transformación del lote.

La entidad admite `parentLotId`, de modo que posteriormente podremos registrar:

- división de lotes;
- mezcla de lotes;
- reprocesos;
- transformación entre etapas;
- trazabilidad inversa desde producto terminado hasta recepción.

## Roadmap

### Fase 1 — Base + recepción/lotes
Estado: iniciada.

- Base PostgreSQL
- Roles
- Proveedores
- Recepción
- Lotes
- Movimientos
- Catálogo de procesos

### Fase 2 — Producción
- Órdenes de producción
- Rutas de proceso
- Bombos y máquinas
- Inicio/fin de proceso
- Pesos y cantidades
- pH, temperatura y variables de proceso
- División/mezcla
- QR de lote

### Fase 3 — Inventario y químicos
- Productos químicos
- unidades
- lotes/caducidad
- entradas/salidas
- recetas
- consumo real vs teórico
- mínimos de inventario

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
- QR
- tablet/celular
- alertas
- auditoría
- mantenimiento
- indicadores ambientales

## Próxima vertical recomendada

Terminar completamente **Recepción → Lote → Proceso → Movimiento**, antes de construir ventas o contabilidad.
