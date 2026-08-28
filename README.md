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

Implementado:

- inspecciones de calidad por lote;
- clasificación/grado;
- espesor en mm y área en dm²;
- resultados de color, visual, resistencia, adherencia y flexión;
- inspector y observaciones;
- catálogo de defectos típicos precargado;
- severidad de defectos;
- pieles y área afectada;
- evidencia documental/fotográfica mediante URL;
- liberación de lote;
- retención;
- rechazo;
- reproceso;
- actualización automática del estado operativo del lote;
- movimiento de rechazo en trazabilidad;
- panel de indicadores de inspecciones aprobadas, rechazadas y en reproceso.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase4_calidad
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

Recepción → Lote → Orden de producción → Ruta → Proceso/Máquina → Receta → Consumo químico → Control de salida → Calidad → Liberación/Reproceso/Rechazo → Producto terminado.

## Roadmap

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
