import { prisma } from "@/lib/prisma";
import { createLotCostEntry, queueAccountingSync, recalculateAllLotCosts, recalculateLotCost } from "./actions";

export const dynamic = "force-dynamic";

const money = (value: unknown) => Number(value ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default async function CostsPage() {
  const [lots, snapshots, salesOrders, syncQueue, supplierInvoices, receivables, payments, expenses] = await Promise.all([
    prisma.tanneryLot.findMany({
      where: { status: { notIn: ["CANCELLED"] } },
      include: { processes: { where: { status: "COMPLETED" }, include: { process: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.lotCostSnapshot.findMany({
      include: { lot: { include: { productionOrder: { include: { salesOrder: true } } } } },
      orderBy: { calculatedAt: "desc" }
    }),
    prisma.salesOrder.findMany({
      include: { customer: true, productionOrders: { include: { lots: { include: { costSnapshot: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.accountingSyncQueue.findMany({ orderBy: { queuedAt: "desc" }, take: 20 }),
    prisma.supplierInvoice.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { issuedAt: "desc" }, take: 10 }),
    prisma.accountReceivable.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { issuedAt: "desc" }, take: 10 }),
    prisma.payment.findMany({ orderBy: { paidAt: "desc" }, take: 10 }),
    prisma.expense.findMany({ where: { status: "POSTED" }, orderBy: { occurredAt: "desc" }, take: 10 })
  ]);

  const totalCost = snapshots.reduce((sum, s) => sum + Number(s.totalCost), 0);
  const rawHide = snapshots.reduce((sum, s) => sum + Number(s.rawHideCost), 0);
  const chemicals = snapshots.reduce((sum, s) => sum + Number(s.chemicalCost), 0);
  const indirect = snapshots.reduce((sum, s) => sum + Number(s.laborCost) + Number(s.waterCost) + Number(s.energyCost) + Number(s.machineCost) + Number(s.reworkCost) + Number(s.overheadCost) + Number(s.otherCost), 0);

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Costos y contabilidad</h1>
          <div className="muted">Costo integral por lote, margen por pedido y cola de integración con CONTPAQi.</div>
        </div>
        <form action={recalculateAllLotCosts}><button className="button" type="submit">Recalcular todos</button></form>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Costo acumulado</div><div className="metric">{money(totalCost)}</div></div>
        <div className="card"><div className="muted">Piel</div><div className="metric">{money(rawHide)}</div></div>
        <div className="card"><div className="muted">Químicos</div><div className="metric">{money(chemicals)}</div></div>
        <div className="card"><div className="muted">Otros costos</div><div className="metric">{money(indirect)}</div></div>
      </section>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Registrar costo al lote</h2>
        <form action={createLotCostEntry} className="form">
          <div className="field"><label>Lote</label><select name="lotId" required><option value="">Selecciona</option>{lots.map(l => <option key={l.id} value={l.id}>{l.folio}</option>)}</select></div>
          <div className="field"><label>Proceso (opcional)</label><select name="lotProcessId"><option value="">General del lote</option>{lots.flatMap(l => l.processes.map(p => <option key={p.id} value={p.id}>{l.folio} · {p.process.name}</option>))}</select></div>
          <div className="field"><label>Categoría</label><select name="category" required><option value="LABOR">Mano de obra</option><option value="WATER">Agua</option><option value="ENERGY">Energía</option><option value="MACHINE">Maquinaria</option><option value="REWORK">Reproceso</option><option value="OVERHEAD">Indirectos</option><option value="OTHER">Otro</option></select></div>
          <div className="field"><label>Descripción</label><input name="description" required /></div>
          <div className="field"><label>Cantidad</label><input name="quantity" type="number" step="0.0001" min="0.0001" defaultValue="1" required /></div>
          <div className="field"><label>Unidad</label><input name="unit" defaultValue="servicio" required /></div>
          <div className="field"><label>Costo unitario</label><input name="unitCost" type="number" step="0.0001" min="0" required /></div>
          <div className="field"><label>Notas</label><input name="notes" /></div>
          <div className="full"><button className="button" type="submit">Registrar costo</button></div>
        </form>
      </div>

      <h2>Costo por lote</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead><tr><th>Lote</th><th>Piel</th><th>Químicos</th><th>MOD</th><th>Servicios/indirectos</th><th>Total</th><th>Costo unitario</th><th></th></tr></thead>
          <tbody>
            {snapshots.length === 0 ? <tr><td colSpan={8} className="muted">Aún no hay costeo calculado.</td></tr> : snapshots.map(s => {
              const services = Number(s.waterCost)+Number(s.energyCost)+Number(s.machineCost)+Number(s.reworkCost)+Number(s.overheadCost)+Number(s.otherCost);
              return <tr key={s.id}>
                <td>{s.lot.folio}</td><td>{money(s.rawHideCost)}</td><td>{money(s.chemicalCost)}</td><td>{money(s.laborCost)}</td><td>{money(services)}</td><td><strong>{money(s.totalCost)}</strong></td>
                <td>{s.costPerDm2 ? `${money(s.costPerDm2)}/dm²` : s.costPerKg ? `${money(s.costPerKg)}/kg` : s.costPerHide ? `${money(s.costPerHide)}/piel` : "—"}</td>
                <td><form action={recalculateLotCost}><input type="hidden" name="lotId" value={s.lotId} /><button className="button" type="submit">Recalcular</button></form></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <h2>Margen por pedido</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Venta sin IVA</th><th>Costo lotes</th><th>Margen</th><th>Margen %</th></tr></thead>
          <tbody>
            {salesOrders.map(order => {
              const cost = order.productionOrders.flatMap(op => op.lots).reduce((sum, lot) => sum + Number(lot.costSnapshot?.totalCost ?? 0), 0);
              const revenue = Number(order.subtotal);
              const margin = revenue - cost;
              const pct = revenue > 0 ? margin / revenue * 100 : 0;
              return <tr key={order.id}><td>{order.folio}</td><td>{order.customer.name}</td><td>{money(revenue)}</td><td>{money(cost)}</td><td>{money(margin)}</td><td>{pct.toFixed(1)}%</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <h2>Preparar integración contable</h2>
      <div className="card" style={{ marginBottom: 22 }}>
        <p className="muted">Estos botones sólo agregan documentos a la cola. Un conector/worker de CONTPAQi los procesará posteriormente.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {[...supplierInvoices.map(x => ({ type:"SUPPLIER_INVOICE", id:x.id, label:`CxP ${x.folio}` })), ...receivables.map(x => ({ type:"RECEIVABLE", id:x.id, label:`CxC ${x.folio}` })), ...payments.map(x => ({ type:"PAYMENT", id:x.id, label:`Pago ${x.folio}` })), ...expenses.map(x => ({ type:"EXPENSE", id:x.id, label:`Gasto ${x.folio}` }))].slice(0,20).map(item => <form action={queueAccountingSync} key={`${item.type}-${item.id}`} style={{ display:"flex", gap:8, alignItems:"center" }}><input type="hidden" name="entityType" value={item.type}/><input type="hidden" name="entityId" value={item.id}/><span style={{ flex:1 }}>{item.label}</span><button className="button" type="submit">Enviar a cola</button></form>)}
        </div>
      </div>

      <h2>Cola CONTPAQi</h2>
      <div className="table-wrap">
        <table><thead><tr><th>Tipo</th><th>ID</th><th>Estado</th><th>Intentos</th><th>En cola</th><th>Error</th></tr></thead><tbody>{syncQueue.length === 0 ? <tr><td colSpan={6} className="muted">Sin documentos pendientes.</td></tr> : syncQueue.map(q => <tr key={q.id}><td>{q.entityType}</td><td>{q.entityId.slice(0,8)}…</td><td><span className="badge">{q.status}</span></td><td>{q.attempts}</td><td>{q.queuedAt.toLocaleString("es-MX")}</td><td>{q.errorMessage ?? "—"}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
