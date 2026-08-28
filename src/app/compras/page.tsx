import { prisma } from "@/lib/prisma";
import { createPurchaseOrder, createPurchaseRequest, receivePurchaseOrder, registerSupplierInvoice } from "./actions";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const [suppliers, chemicals, warehouses, requests, orders, invoices] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.chemicalProduct.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.purchaseRequest.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.purchaseOrder.findMany({ include: { items: true, receipts: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.supplierInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 12 })
  ]);
  const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));

  return <>
    <div className="header"><div><h1 className="title">Compras</h1><div className="muted">Requisiciones, órdenes de compra, recepción e integración con CxP.</div></div></div>

    <section className="cards">
      <div className="card"><div className="muted">Requisiciones</div><div className="metric">{requests.length}</div></div>
      <div className="card"><div className="muted">Órdenes abiertas</div><div className="metric">{orders.filter(o => !["RECEIVED","CANCELLED"].includes(o.status)).length}</div></div>
      <div className="card"><div className="muted">Facturas abiertas</div><div className="metric">{invoices.filter(i => i.status !== "PAID").length}</div></div>
    </section>

    <div className="card" style={{marginBottom:22}}><h2>Nueva requisición</h2>
      <form action={createPurchaseRequest} className="form">
        <div className="field"><label>Solicitante</label><input name="requester" /></div>
        <div className="field"><label>Descripción</label><input name="description" required /></div>
        <div className="field"><label>Químico relacionado</label><select name="chemicalId"><option value="">No aplica</option>{chemicals.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
        <div className="field"><label>Cantidad</label><input name="quantity" type="number" step="0.001" min="0.001" required /></div>
        <div className="field"><label>Unidad</label><input name="unit" defaultValue="kg" required /></div>
        <div className="field"><label>Costo estimado unitario</label><input name="estimatedUnitCost" type="number" step="0.01" min="0" /></div>
        <div className="field"><label>Se requiere para</label><input name="neededBy" type="date" /></div>
        <div className="field"><label>Notas</label><input name="notes" /></div>
        <div className="full"><button className="button">Crear requisición</button></div>
      </form>
    </div>

    <div className="card" style={{marginBottom:22}}><h2>Nueva orden de compra</h2>
      <form action={createPurchaseOrder} className="form">
        <div className="field"><label>Proveedor</label><select name="supplierId" required><option value="">Selecciona</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Químico</label><select name="chemicalId"><option value="">Otro concepto</option>{chemicals.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
        <div className="field"><label>Descripción</label><input name="description" required /></div>
        <div className="field"><label>Cantidad</label><input name="quantity" type="number" step="0.001" min="0.001" required /></div>
        <div className="field"><label>Unidad</label><input name="unit" defaultValue="kg" required /></div>
        <div className="field"><label>Costo unitario</label><input name="unitCost" type="number" step="0.0001" min="0" required /></div>
        <div className="field"><label>IVA %</label><input name="taxRate" type="number" step="0.01" defaultValue="16" /></div>
        <div className="field"><label>Fecha esperada</label><input name="expectedAt" type="date" /></div>
        <div className="full"><button className="button">Emitir orden</button></div>
      </form>
    </div>

    <h2>Órdenes recientes</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>OC</th><th>Proveedor</th><th>Total</th><th>Estado</th><th>Recepción</th></tr></thead><tbody>
      {orders.length===0?<tr><td colSpan={5} className="muted">Sin órdenes.</td></tr>:orders.map(o=>{const item=o.items[0]; const pending=item?Number(item.quantity)-Number(item.receivedQuantity):0; return <tr key={o.id}><td>{o.folio}</td><td>{supplierMap.get(o.supplierId)??o.supplierId}</td><td>${Number(o.total).toFixed(2)}</td><td>{o.status}</td><td>{item&&pending>0?<form action={receivePurchaseOrder} style={{display:"grid",gap:6,minWidth:260}}><input type="hidden" name="purchaseOrderId" value={o.id}/><input type="hidden" name="itemId" value={item.id}/><input name="quantity" type="number" step="0.001" max={pending} defaultValue={pending} required/><select name="warehouseId"><option value="">Sin almacén</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select><input name="lotNumber" placeholder="Lote proveedor"/><input name="expiresAt" type="date"/><button className="button">Recibir</button></form>:"Completa"}</td></tr>})}
    </tbody></table></div>

    <div className="card" style={{marginBottom:22}}><h2>Registrar factura de proveedor</h2><form action={registerSupplierInvoice} className="form">
      <div className="field"><label>Proveedor</label><select name="supplierId" required><option value="">Selecciona</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field"><label>Orden de compra</label><select name="purchaseOrderId"><option value="">Sin relación</option>{orders.map(o=><option key={o.id} value={o.id}>{o.folio}</option>)}</select></div>
      <div className="field"><label>Total</label><input name="total" type="number" step="0.01" min="0.01" required/></div>
      <div className="field"><label>Vencimiento</label><input name="dueDate" type="date"/></div>
      <div className="field"><label>Folio externo</label><input name="externalFolio"/></div>
      <div className="field"><label>UUID</label><input name="externalUuid"/></div>
      <div className="full"><button className="button">Registrar factura / CxP</button></div>
    </form></div>

    <h2>Facturas proveedor</h2><div className="table-wrap"><table><thead><tr><th>Folio</th><th>Proveedor</th><th>Total</th><th>Saldo</th><th>Estado</th><th>Vence</th></tr></thead><tbody>{invoices.length===0?<tr><td colSpan={6} className="muted">Sin facturas.</td></tr>:invoices.map(i=><tr key={i.id}><td>{i.folio}</td><td>{supplierMap.get(i.supplierId)??i.supplierId}</td><td>${Number(i.total).toFixed(2)}</td><td>${Number(i.balance).toFixed(2)}</td><td>{i.status}</td><td>{i.dueDate?.toLocaleDateString("es-MX")??"—"}</td></tr>)}</tbody></table></div>
  </>;
}
