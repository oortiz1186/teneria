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

Incluye clientes, artículos comerciales, precios, cotizaciones, pedidos, generación automática de órdenes de producción, remisiones y trazabilidad Pedido → Producción → Lote → Entrega.

### Fase 6 — Compras y administración
Estado: completada en su alcance inicial.

Implementado:

- requisiciones de compra;
- partidas con cantidad, unidad y costo estimado;
- órdenes de compra por proveedor;
- impuestos y totales de OC;
- recepción parcial o total contra OC;
- control de cantidad pedida vs recibida;
- creación automática de lote químico al recibir materiales químicos;
- movimiento automático de entrada a inventario;
- facturas de proveedor;
- referencia a folio/UUID fiscal externo;
- cuentas por pagar con saldo y vencimiento;
- cuentas por cobrar con saldo y vencimiento;
- relación opcional de CxC con pedido y remisión;
- cobros parciales o totales;
- pagos parciales o totales a proveedor;
- aplicación de pagos a documentos;
- métodos de pago: efectivo, transferencia, tarjeta, cheque y otros;
- gastos administrativos/operativos por categoría;
- panel financiero con CxC, CxP, gastos y movimientos recientes;
- estructura preparada para sincronización posterior con CONTPAQi.

Los documentos fiscales siguen siendo referencias operativas dentro del ERP. El timbrado, cancelación, XML/PDF y conciliación fiscal se integrarán posteriormente con CONTPAQi.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase6_compras_administracion
npm run db:seed
npm run dev
```

Abrir:

http://localhost:3000

Módulos principales de esta fase:

- `/compras`
- `/finanzas`

Configurar en `.env` la URL pública usada por los QR cuando el sistema se despliegue:

```env
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

## Flujo operativo actual

Compra:

Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

Venta:

Cliente → Cotización → Pedido → Producción → Lote → Calidad → Remisión → CxC → Cobro.

## Roadmap

### Fase 7 — Costos y contabilidad
- costo integral por lote
- costo de piel de origen
- costo químico real
- mano de obra
- agua y energía
- maquinaria/proceso
- merma y reproceso
- distribución de gastos indirectos
- costo por dm²/kg/pieza
- margen por pedido/cliente/artículo
- interfaz con CONTPAQi Contabilidad

### Fase 8 — Indicadores y piso
- dashboards ejecutivos
- interfaz optimizada para tablet/celular
- alertas
- auditoría
- mantenimiento
- indicadores ambientales
