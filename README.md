# Tenería ERP

ERP especializado para operación integral de tenerías.

## Estado actual

### Fase 1 — Base + recepción/lotes
Estado: completada.

Incluye PostgreSQL propio con Docker, usuarios/roles, proveedores/clientes, almacenes, recepción de piel, creación automática de lote, catálogo de procesos, movimientos y dashboard inicial.

### Fase 2 — Producción
Estado: completada en su alcance inicial.

Incluye órdenes de producción, rutas configurables, asignación de lotes, máquinas/bombos, inicio/cierre de procesos, peso y pieles de entrada/salida, pH, temperatura, merma, división/mezcla, genealogía, QR, trazabilidad y cierre automático hacia producto terminado.

### Fase 3 — Inventarios, químicos y recetas
Estado: completada en su alcance inicial.

Incluye catálogo de químicos, existencias por lote físico, proveedores, almacenes, costos, caducidades, mínimos, recetas por proceso, cantidades teóricas, consumo real, descuento automático de inventario y costo químico por lote/proceso.

### Fase 4 — Calidad
Estado: completada en su alcance inicial.

Incluye inspecciones por lote/proceso, clasificación, espesor, área, resultados de pruebas, defectos, severidad, evidencia, liberación, retención, rechazo y reproceso.

### Fase 5 — Comercial
Estado: completada en su alcance inicial.

Implementado:

- alta rápida de clientes;
- catálogo de artículos/piel comercial;
- unidad comercial por pieza, kg, dm² o ft²;
- precio base e IVA configurable por artículo;
- asociación de artículo con ruta de producción;
- cotizaciones con vigencia, subtotal, impuestos y total;
- estados de cotización;
- conversión de cotización aceptada a pedido;
- pedidos comerciales;
- confirmación de pedido;
- generación automática de órdenes de producción desde el pedido;
- relación Pedido → Orden de Producción → Lote;
- remisiones de lotes terminados/liberados;
- trazabilidad del lote entregado al cliente;
- historial de remisiones;
- estructura preparada para integración fiscal posterior.

La facturación CFDI no se timbra directamente desde esta fase. El ERP conservará la operación comercial y posteriormente se integrará con CONTPAQi para timbrado, UUID, XML/PDF, cancelaciones, pagos y conciliación fiscal.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase5_comercial
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

Cliente → Cotización → Pedido → Orden de producción → Lote → Ruta/Proceso → Receta/Consumo químico → Calidad → Producto terminado → Remisión.

## Roadmap

### Fase 6 — Compras y administración
- requisiciones
- órdenes de compra
- recepción contra OC
- facturas de proveedor
- CxP
- CxC
- pagos y cobranza
- gastos
- bancos/caja

### Fase 7 — Costos y contabilidad
- costo integral por lote
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
