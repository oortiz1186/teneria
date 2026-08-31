import { prisma } from "@/lib/prisma";
import { acceptQuoteAndCreateOrder, confirmSalesOrder, createCommercialProduct, createCustomer, createQuote, createShipment, markQuoteSent } from "./actions";
import { cancelShipment } from "./cancel-actions";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [customers, products, routes, quotes, orders, completedLots, shipments] = await Promise.all([
    prisma.customer.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.commercialProduct.findMany({ where: { active: true }, include: { route: true }, orderBy: { code: "asc" } }),
    prisma.productionRoute.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.salesQuote.findMany({ include: { customer: true, items: { include: { product: true } }, salesOrder: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.salesOrder.findMany({
      include: {
        customer: true,
        items: { include: { product: true } },
        productionOrders: true,
        shipments: { where: { status: { not: "CANCELLED" } }, include: { items: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.tanneryLot.findMany({ where: { status: "COMPLETED" }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.shipment.findMany({ include: { customer: true, items: { include: { product: true, lot: true } }, receivables: true }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);

  return <>
    <div className="header"><div><h1 className="title">Ventas</h1><div className="muted">Clientes, artículos, cotizaciones, pedidos, producción y remisiones.</div></div></div>

    <section className="cards">
      <div className="card"><div className="muted">Clientes</div><div className="metric">{customers.length}</div></div>
      <div className="card"><div className="muted">Cotizaciones</div><div className="metric">{quotes.length}</div></div>
      <div className="card"><div className="muted">Pedidos activos</div><div className="metric">{orders.filter(o => !["SHIPPED","CANCELLED"].includes(o.status)).length}</div></div>
      <div className="card"><div className="muted">Remisiones</div><div className="metric">{shipments.length}</div></div>
    </section>

    <div className="card" style={{marginBottom:22}}><h2>Alta rápida de cliente</h2><form action={createCustomer} className="form">
      <div className="field"><label>Nombre / razón social</label><input name="name" required /></div>
      <div className="field"><label>RFC</label><input name="taxId" /></div>
      <div className="field"><label>Teléfono</label><input name="phone" /></div>
      <div className="field"><label>Email</label><input name="email" type="email" /></div>
      <div className="full"><button className="button">Guardar cliente</button></div>
    </form></div>

    <div className="card" style={{marginBottom:22}}><h2>Artículo / piel comercial</h2><form action={createCommercialProduct} className="form">
      <div className="field"><label>Código</label><input name="code" required /></div>
      <div className="field"><label>Nombre</label><input name="name" required /></div>
      <div className="field"><label>Unidad</label><select name="unit"><option value="DM2">dm²</option><option value="FT2">ft²</option><option value="KG">kg</option><option value="PIECE">pieza</option></select></div>
      <div className="field"><label>Precio base</label><input name="basePrice" type="number" min="0" step="0.0001" required /></div>
      <div className="field"><label>IVA %</label><input name="taxRate" type="number" min="0" max="100" step="0.001" defaultValue="16" required /></div>
      <div className="field"><label>Ruta de producción</label><select name="routeId"><option value="">Sin ruta</option>{routes.map(r=><option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></div>
      <div className="full field"><label>Descripción</label><input name="description" /></div>
      <div className="full"><button className="button">Guardar artículo</button></div>
    </form></div>

    <div className="card" style={{marginBottom:22}}><h2>Nueva cotización</h2><form action={createQuote} className="form">
      <div className="field"><label>Cliente</label><select name="customerId" required><option value="">Selecciona</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label>Artículo</label><select name="productId" required><option value="">Selecciona</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name} · ${Number(p.basePrice).toFixed(2)}/{p.unit}</option>)}</select></div>
      <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required /></div>
      <div className="field"><label>Precio unitario</label><input name="unitPrice" type="number" min="0" step="0.0001" required /></div>
      <div className="field"><label>Vigencia</label><input name="validUntil" type="date" /></div>
      <div className="field"><label>Notas</label><input name="notes" /></div>
      <div className="full"><button className="button">Crear cotización</button></div>
    </form></div>

    <h2>Cotizaciones</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>Folio</th><th>Cliente</th><th>Artículo</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{quotes.length===0?<tr><td colSpan={6} className="muted">Sin cotizaciones.</td></tr>:quotes.map(q=><tr key={q.id}><td>{q.folio}</td><td>{q.customer.name}</td><td>{q.items.map(i=>i.product.code).join(", ")}</td><td>${Number(q.total).toFixed(2)}</td><td><span className="badge">{q.status}</span></td><td>{!q.salesOrder&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{q.status==="DRAFT"&&<form action={markQuoteSent}><input type="hidden" name="quoteId" value={q.id}/><button className="button">Marcar enviada</button></form>}<form action={acceptQuoteAndCreateOrder}><input type="hidden" name="quoteId" value={q.id}/><button className="button">Aceptar y crear pedido</button></form></div>}</td></tr>)}</tbody></table></div>

    <h2>Pedidos</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Avance de entrega</th><th>OP</th><th>Acción</th></tr></thead><tbody>{orders.length===0?<tr><td colSpan={7} className="muted">Sin pedidos.</td></tr>:orders.map(o=>{
      const shippedByProduct = new Map<string, number>();
      for (const shipment of o.shipments) for (const item of shipment.items) shippedByProduct.set(item.productId, (shippedByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      return <tr key={o.id}><td>{o.folio}</td><td>{o.customer.name}</td><td>${Number(o.total).toFixed(2)}</td><td><span className="badge">{o.status}</span></td><td>{o.items.map(item=>{const shipped=shippedByProduct.get(item.productId)??0; const ordered=Number(item.quantity); const pending=Math.max(0,ordered-shipped); return <div key={item.id} style={{marginBottom:4}}><strong>{item.product.code}</strong>: {shipped.toFixed(3)} / {ordered.toFixed(3)} {item.product.unit} <span className="muted">· pendiente {pending.toFixed(3)}</span></div>})}</td><td>{o.productionOrders.map(p=>p.folio).join(", ")||"—"}</td><td>{o.status==="DRAFT"&&<form action={confirmSalesOrder}><input type="hidden" name="salesOrderId" value={o.id}/><button className="button">Confirmar y enviar a producción</button></form>}</td></tr>})}</tbody></table></div>

    <div className="card" style={{marginBottom:22}}><h2>Generar remisión</h2><div className="muted" style={{marginBottom:12}}>El sistema valida el pendiente acumulado del artículo y la disponibilidad del lote antes de emitir.</div><form action={createShipment} className="form">
      <div className="field"><label>Pedido</label><select name="salesOrderId" required><option value="">Selecciona</option>{orders.filter(o=>!["DRAFT","CANCELLED","SHIPPED"].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.folio} · {o.customer.name}</option>)}</select></div>
      <div className="field"><label>Artículo</label><select name="productId" required><option value="">Selecciona</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
      <div className="field"><label>Lote terminado</label><select name="lotId" required><option value="">Selecciona</option>{completedLots.map(l=><option key={l.id} value={l.id}>{l.folio} · {l.articleCode??"sin artículo"}</option>)}</select></div>
      <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required /></div>
      <div className="full"><button className="button">Emitir remisión</button></div>
    </form></div>

    <h2>Remisiones recientes</h2><div className="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Artículo / lote</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{shipments.length===0?<tr><td colSpan={6} className="muted">Sin remisiones.</td></tr>:shipments.map(s=><tr key={s.id}><td>{s.folio}</td><td>{s.customer.name}</td><td>{s.shippedAt?.toLocaleString("es-MX")??"—"}</td><td>{s.items.map(i=>`${i.product.code} / ${i.lot?.folio??"—"} / ${Number(i.quantity)}`).join("; ")}</td><td><span className="badge">{s.status}</span>{s.notes&&<div className="muted" style={{marginTop:4,whiteSpace:"pre-wrap"}}>{s.notes}</div>}</td><td>{s.status==="ISSUED"?<form action={cancelShipment} style={{display:"grid",gap:6,minWidth:220}}><input type="hidden" name="shipmentId" value={s.id}/><input name="reason" minLength={10} maxLength={500} placeholder="Motivo de cancelación" required/><button className="button button-secondary" type="submit">Cancelar remisión</button>{s.receivables.some(r=>r.status!=="CANCELLED")&&<span className="muted">Tiene CxC vigente; primero debe resolverse en Finanzas.</span>}</form>:<span className="muted">Sin acciones</span>}</td></tr>)}</tbody></table></div>
  </>;
}
