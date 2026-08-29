import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createExpense, createReceivable, registerPayablePayment, registerReceivablePayment } from "./actions";

export const dynamic = "force-dynamic";

const methods = ["CASH","TRANSFER","CARD","CHECK","OTHER"] as const;

export default async function FinancePage() {
  const [customers, suppliers, orders, shipments, receivables, payables, payments, expenses] = await Promise.all([
    prisma.customer.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.salesOrder.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.shipment.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.accountReceivable.findMany({ orderBy: { issuedAt: "desc" }, take: 30 }),
    prisma.supplierInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 30 }),
    prisma.payment.findMany({ include: { applications: true }, orderBy: { paidAt: "desc" }, take: 20 }),
    prisma.expense.findMany({ orderBy: { occurredAt: "desc" }, take: 20 })
  ]);

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
  const arTotal = receivables.reduce((a,r)=>a+Number(r.balance),0);
  const apTotal = payables.reduce((a,r)=>a+Number(r.balance),0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const monthExpenses = expenses.filter(e=>e.occurredAt>=monthStart).reduce((a,e)=>a+Number(e.amount)+Number(e.tax),0);

  return <>
    <div className="header"><div><h1 className="title">Administración / Finanzas</h1><div className="muted">CxC, CxP, cobros, pagos, gastos y referencias fiscales externas.</div></div></div>

    <section className="cards">
      <div className="card"><div className="muted">Cuentas por cobrar</div><div className="metric">${arTotal.toFixed(2)}</div></div>
      <div className="card"><div className="muted">Cuentas por pagar</div><div className="metric">${apTotal.toFixed(2)}</div></div>
      <div className="card"><div className="muted">Gastos del mes</div><div className="metric">${monthExpenses.toFixed(2)}</div></div>
      <div className="card"><div className="muted">Movimientos recientes</div><div className="metric">{payments.length}</div></div>
    </section>

    <div className="card" style={{marginBottom:22}}><h2>Crear cuenta por cobrar</h2><form action={createReceivable} className="form">
      <div className="field"><label>Cliente</label><select name="customerId" required><option value="">Selecciona</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label>Pedido</label><select name="salesOrderId"><option value="">Sin relación</option>{orders.map(o=><option key={o.id} value={o.id}>{o.folio} · ${Number(o.total).toFixed(2)}</option>)}</select></div>
      <div className="field"><label>Remisión</label><select name="shipmentId"><option value="">Sin relación</option>{shipments.map(s=><option key={s.id} value={s.id}>{s.folio}</option>)}</select></div>
      <div className="field"><label>Total</label><input name="total" type="number" step="0.01" min="0.01" required/></div>
      <div className="field"><label>Vencimiento</label><input name="dueDate" type="date"/></div>
      <div className="field"><label>Folio fiscal/externo</label><input name="externalFolio"/></div>
      <div className="field"><label>UUID</label><input name="externalUuid"/></div>
      <div className="full"><button className="button">Crear CxC</button></div>
    </form></div>

    <h2>Cuentas por cobrar</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Saldo</th><th>Vence</th><th>Documentos</th><th>Cobrar</th></tr></thead><tbody>{receivables.length===0?<tr><td colSpan={7} className="muted">Sin cuentas por cobrar.</td></tr>:receivables.map(r=><tr key={r.id}><td><Link href={`/finanzas/cxc/${r.id}`}>{r.folio}</Link></td><td>{customerMap.get(r.customerId)??r.customerId}</td><td>${Number(r.total).toFixed(2)}</td><td>${Number(r.balance).toFixed(2)}</td><td>{r.dueDate?.toLocaleDateString("es-MX")??"—"}</td><td><Link className="button button-secondary" href={`/finanzas/cxc/${r.id}`}>CFDI / PDF</Link></td><td>{Number(r.balance)>0?<form action={registerReceivablePayment} style={{display:"grid",gap:6,minWidth:220}}><input type="hidden" name="receivableId" value={r.id}/><input name="amount" type="number" step="0.01" max={Number(r.balance)} defaultValue={Number(r.balance)} required/><select name="method">{methods.map(m=><option key={m} value={m}>{m}</option>)}</select><input name="reference" placeholder="Referencia"/><button className="button">Registrar cobro</button></form>:<span className="badge">PAGADA</span>}</td></tr>)}</tbody></table></div>

    <h2>Cuentas por pagar</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>Folio</th><th>Proveedor</th><th>Total</th><th>Saldo</th><th>Vence</th><th>Documentos</th><th>Pagar</th></tr></thead><tbody>{payables.length===0?<tr><td colSpan={7} className="muted">Sin cuentas por pagar.</td></tr>:payables.map(r=><tr key={r.id}><td><Link href={`/compras/facturas/${r.id}`}>{r.folio}</Link></td><td>{supplierMap.get(r.supplierId)??r.supplierId}</td><td>${Number(r.total).toFixed(2)}</td><td>${Number(r.balance).toFixed(2)}</td><td>{r.dueDate?.toLocaleDateString("es-MX")??"—"}</td><td><Link className="button button-secondary" href={`/compras/facturas/${r.id}`}>XML / PDF</Link></td><td>{Number(r.balance)>0?<form action={registerPayablePayment} style={{display:"grid",gap:6,minWidth:220}}><input type="hidden" name="supplierInvoiceId" value={r.id}/><input name="amount" type="number" step="0.01" max={Number(r.balance)} defaultValue={Number(r.balance)} required/><select name="method">{methods.map(m=><option key={m} value={m}>{m}</option>)}</select><input name="reference" placeholder="Referencia"/><button className="button">Registrar pago</button></form>:<span className="badge">PAGADA</span>}</td></tr>)}</tbody></table></div>

    <div className="card" style={{marginBottom:22}}><h2>Registrar gasto</h2><form action={createExpense} className="form">
      <div className="field"><label>Categoría</label><input name="category" placeholder="Energía, agua, mantenimiento..." required/></div>
      <div className="field"><label>Descripción</label><input name="description" required/></div>
      <div className="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field"><label>Importe</label><input name="amount" type="number" step="0.01" min="0.01" required/></div>
      <div className="field"><label>Impuesto</label><input name="tax" type="number" step="0.01" min="0" defaultValue="0"/></div>
      <div className="field"><label>Método</label><select name="paymentMethod">{methods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
      <div className="field"><label>Referencia</label><input name="reference"/></div>
      <div className="full"><button className="button">Registrar gasto</button></div>
    </form></div>

    <h2>Pagos y cobros recientes</h2><div className="table-wrap" style={{marginBottom:22}}><table><thead><tr><th>Folio</th><th>Tipo</th><th>Método</th><th>Importe</th><th>Fecha</th><th>Referencia</th></tr></thead><tbody>{payments.length===0?<tr><td colSpan={6} className="muted">Sin movimientos.</td></tr>:payments.map(p=><tr key={p.id}><td>{p.folio}</td><td>{p.direction}</td><td>{p.method}</td><td>${Number(p.amount).toFixed(2)}</td><td>{p.paidAt.toLocaleString("es-MX")}</td><td>{p.reference??"—"}</td></tr>)}</tbody></table></div>

    <h2>Gastos recientes</h2><div className="table-wrap"><table><thead><tr><th>Folio</th><th>Categoría</th><th>Descripción</th><th>Total</th><th>Fecha</th></tr></thead><tbody>{expenses.length===0?<tr><td colSpan={5} className="muted">Sin gastos.</td></tr>:expenses.map(e=><tr key={e.id}><td>{e.folio}</td><td>{e.category}</td><td>{e.description}</td><td>${(Number(e.amount)+Number(e.tax)).toFixed(2)}</td><td>{e.occurredAt.toLocaleDateString("es-MX")}</td></tr>)}</tbody></table></div>
  </>;
}
