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

Implementado:

- catálogo de productos químicos;
- categorías y unidades de medida;
- existencia mínima por producto;
- almacén específico de químicos;
- lotes físicos por producto químico;
- proveedor y número de lote;
- fecha de recepción y caducidad;
- cantidad inicial y existencia actual;
- costo unitario por lote químico;
- movimientos de entrada y consumo;
- alertas visuales de mínimo de existencia;
- alerta de lotes próximos a caducar;
- recetas vinculadas a procesos;
- versionado base de recetas;
- componentes secuenciados de receta;
- dos bases de cálculo: porcentaje sobre peso y cantidad fija;
- tolerancia por componente;
- registro de consumo real por proceso activo;
- selección del lote físico de químico consumido;
- descuento automático de inventario;
- validación de existencia disponible;
- cálculo de cantidad teórica según receta y peso de entrada;
- comparación teórico vs real;
- costo real del químico consumido por proceso y lote;
- historial de consumos químicos.

## Requisitos

- Node.js 22+
- Docker / Docker Compose
- npm

## Actualizar una instalación existente

```bash
git pull
npm install
npm run db:generate
npm run db:migrate -- --name fase3_inventario_quimicos_recetas
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

Recepción → Lote → Orden de producción → Ruta → Proceso/Máquina → Receta → Consumo químico → Control de salida → Siguiente proceso → Calidad → Producto terminado.

Cada consumo químico queda asociado al `LotProcess`, por lo que se conserva la relación entre lote de producción, proceso, lote químico, cantidad real y costo.

## Roadmap

### Fase 4 — Calidad
- inspecciones y puntos de control
- catálogo de defectos
- clasificación/grado
- pruebas y mediciones
- rechazo parcial/total
- reproceso
- evidencia/fotos
- liberación a producto terminado

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
