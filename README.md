# Tenería ERP

ERP especializado para operación de tenerías.

## Estado actual

### Fase 1 — Base + recepción/lotes
Estado: completada.

- PostgreSQL propio con Docker
- usuarios y roles
- proveedores y clientes
- almacenes
- recepción de piel
- creación automática de lote
- jerarquía de lotes
- catálogo de procesos
- movimientos de lote
- dashboard inicial

### Fase 2 — Producción
Estado: en desarrollo, núcleo operativo implementado.

Implementado:

- catálogo de bombos/máquinas
- estado de máquina: disponible, en uso, mantenimiento e inactiva
- capacidad por máquina
- inicio de proceso por lote
- bloqueo para impedir dos procesos simultáneos sobre el mismo lote
- bloqueo para impedir usar una máquina ocupada
- captura automática de pieles y peso de entrada
- captura de pieles y peso de salida
- pH y temperatura
- observaciones
- liberación automática de máquina al finalizar
- actualización del peso y cantidad actual del lote
- movimientos PROCESS_IN / PROCESS_OUT
- historial de procesos
- cálculo visual de merma en kg y porcentaje
- modelo base de órdenes de producción
- relación orden de producción → lotes

Pendiente para cerrar Fase 2:

- pantalla CRUD de órdenes de producción
- asignación de lote a orden
- rutas de proceso predefinidas por artículo
- división y mezcla de lotes desde interfaz
- QR de lote
- estados finales y envío a almacén terminado

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
npm run db:migrate -- --name fase2_produccion
npm run db:seed
npm run dev
```

Abrir:

http://localhost:3000

## Arquitectura

El `TanneryLot` es el centro de la trazabilidad. Cada ejecución queda registrada en `LotProcess` y cada entrada/salida relevante genera un `LotMovement`.

Las órdenes comerciales y administrativas se conectarán al lote sin reemplazar esta trazabilidad.

## Roadmap

### Fase 3 — Inventario y químicos
- productos químicos
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
