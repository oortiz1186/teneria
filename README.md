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

Incluye requisiciones, órdenes de compra, recepciones, inventario, facturas de proveedor, CxP, CxC, pagos, cobros, gastos y referencias fiscales externas.

### Fase 7 — Costos y contabilidad
Estado: completada en su alcance inicial.

Implementado:

- costo integral por lote;
- costo de piel de origen prorrateado por peso del lote;
- costo químico real tomado de consumos registrados;
- mano de obra asignable por lote/proceso;
- agua y energía;
- costo de maquinaria;
- costo de reproceso;
- gastos indirectos/overhead;
- otros costos manuales auditables;
- detalle por categoría de costo;
- snapshot de costo recalculable por lote;
- costo unitario por piel, kg y dm² cuando existe el dato de salida;
- margen por pedido usando venta sin IVA contra costo de los lotes producidos;
- cola de integración contable;
- estados PENDING / PROCESSING / EXPORTED / ERROR / RECONCILED;
- cola preparada para facturas de proveedor, CxC, pagos, gastos, pedidos y órdenes de compra;
- estructura preparada para un worker/conector de CONTPAQi.

El sistema no genera pólizas fiscales ni escribe directamente en CONTPAQi todavía. La cola de sincronización desacopla el ERP del futuro conector Windows/CONTPAQi y permite reintentos, auditoría y conciliación.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase7_costos_contabilidad
npm run db:seed
npm run dev
```

Abrir:

http://localhost:3000

Módulos principales:

- `/compras`
- `/finanzas`
- `/costos`

Configurar en `.env` la URL pública usada por los QR cuando el sistema se despliegue:

```env
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"
```

## Flujo operativo actual

Compra:

Requisición → Orden de compra → Recepción → Inventario → Factura proveedor → CxP → Pago.

Venta:

Cliente → Cotización → Pedido → Producción → Lote → Calidad → Remisión → CxC → Cobro.

Costeo:

Recepción de piel + Consumo químico + Mano de obra + Agua/Energía + Máquina + Reproceso + Indirectos → Costo integral del lote → Costo unitario → Margen por pedido.

Contabilidad:

Documento operativo → Cola de sincronización → Worker CONTPAQi (fase de integración posterior) → Estado exportado/conciliado.

## Roadmap

### Fase 8 — Indicadores y piso
- dashboards ejecutivos
- interfaz optimizada para tablet/celular
- alertas
- auditoría
- mantenimiento
- indicadores ambientales
- productividad por máquina/proceso
- tiempos de ciclo y cuellos de botella
- indicadores de calidad, inventario, ventas, cartera y margen
