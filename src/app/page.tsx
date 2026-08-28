import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const money = (value: unknown) => Number(value ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default async function DashboardPage() {
  const [lots, inProcess, completedLots, productionOrders, machines, qualityRejected, qualityRework, chemicals, receivables, payables, salesOrders, costSnapshots, recentLots] = await Promise.all([
    prisma.tanneryLot.count(),
    prisma.tanneryLot.count({ where: { status: "IN_PROCESS" } }),
    prisma.tanneryLot.count({ where: { status: "COMPLETED" } }),
    prisma.productionOrder.findMany({ where: { status: { in: ["RELEASED", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" }, take: 20 }),
    prisma.machine.findMany(),
    prisma.qualityInspection.count({ where: { status: "REJECTED" } }),
    prisma.qualityInspection.count({ where: { status: "REWORK_REQUIRED" } }),
    prisma.chemicalProduct.findMany({ where: { active: true }, include: { lots: true } }),
    prisma.accountReceivable.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
    prisma.supplierInvoice.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
    prisma.salesOrder.findMany({ where: { status: { not: "CANCELLED" } }, include: { productionOrders: { include: { lots: { include: { costSnapshot: true } } } } } }),
    prisma.lotCostSnapshot.findMany(),
    prisma.tanneryLot.findMany({ take: 8, orderBy: { updatedAt: "desc" } })
  ]);

  const lowStock = chemicals.filter(p => p.minStock != null && p.lots.reduce((s, l) => s + Number(l.currentQuantity), 0) <= Number(p.minStock));
  const maintenance = machines.filter(m => m.status === "MAINTENANCE").length;
  const ar = receivables.reduce((s, x) => s + Number(x.balance), 0);
  const ap = payables.reduce((s, x) => s + Number(x.balance), 0);
  const totalCost = costSnapshots.reduce((s, x) => s + Number(x.totalCost), 0);
  const totalRevenue = salesOrders.reduce((s, x) => s + Number(x.subtotal), 0);
  const salesCost = salesOrders.reduce((sum, order) => sum + order.productionOrders.flatMap(op => op.lots).reduce((s, lot) => s + Number(lot.costSnapshot?.totalCost ?? 0), 0), 0);
  const margin = totalRevenue - salesCost;
  const marginPct = totalRevenue > 0 ? margin / totalRevenue * 100 : 0;
  const overdue = productionOrders.filter(op => op.dueDate && op.dueDate < new Date()).length;

  return (
    <>
      <div className="header"><div><h1 className="title">Dashboard ejecutivo</h1><div className="muted">Producción, calidad, inventario, cartera y rentabilidad en una sola vista.</div></div><Link className="button" href="/operacion">Ir a piso</Link></div>

      <section className="cards">
        <div className="card"><div className="muted">Lotes en proceso</div><div className="metric">{inProcess}</div><div className="muted">{completedLots} terminados de {lots}</div></div>
        <div className="card"><div className="muted">Órdenes activas</div><div className="metric">{productionOrders.length}</div><div className="muted">{overdue} vencidas</div></div>
        <div className="card"><div className="muted">Alertas inventario</div><div className="metric">{lowStock.length}</div><div className="muted">productos en mínimo</div></div>
        <div className="card"><div className="muted">Equipos mantenimiento</div><div className="metric">{maintenance}</div><div className="muted">de {machines.length} máquinas</div></div>
      </section>

      <section className="cards">
        <div className="card"><div className="muted">CxC pendiente</div><div className="metric">{money(ar)}</div></div>
        <div className="card"><div className="muted">CxP pendiente</div><div className="metric">{money(ap)}</div></div>
        <div className="card"><div className="muted">Costo acumulado</div><div className="metric">{money(totalCost)}</div></div>
        <div className="card"><div className="muted">Margen comercial</div><div className="metric">{money(margin)}</div><div className="muted">{marginPct.toFixed(1)}% sobre venta sin IVA</div></div>
      </section>

      <div className="quick-grid">
        <Link className="quick-card" href="/produccion"><strong>Producción</strong><span>{productionOrders.length} órdenes activas</span></Link>
        <Link className="quick-card" href="/calidad"><strong>Calidad</strong><span>{qualityRejected} rechazadas · {qualityRework} reproceso</span></Link>
        <Link className="quick-card" href="/inventario"><strong>Inventario</strong><span>{lowStock.length} alertas de mínimo</span></Link>
        <Link className="quick-card" href="/finanzas"><strong>Finanzas</strong><span>Cartera y pagos</span></Link>
      </div>

      <h2>Últimos lotes actualizados</h2>
      <div className="table-wrap"><table><thead><tr><th>Lote</th><th>Tipo</th><th>Pieles</th><th>Peso actual</th><th>Estado</th><th>Proceso</th></tr></thead><tbody>{recentLots.length === 0 ? <tr><td colSpan={6} className="muted">Todavía no hay lotes registrados.</td></tr> : recentLots.map(lot => <tr key={lot.id}><td><Link href={`/lotes/${lot.id}`}>{lot.folio}</Link></td><td>{lot.animalType}</td><td>{lot.currentHides}</td><td>{Number(lot.currentWeightKg).toFixed(2)} kg</td><td><span className="badge">{lot.status}</span></td><td>{lot.currentProcessCode ?? "Recepción"}</td></tr>)}</tbody></table></div>
    </>
  );
}
