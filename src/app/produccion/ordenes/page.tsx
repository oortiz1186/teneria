import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createProductionOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, routes] = await Promise.all([
    prisma.productionOrder.findMany({
      include: { customer: true, route: true, _count: { select: { lots: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.productionRoute.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);

  return (
    <>
      <div className="header"><div><h1 className="title">Órdenes de producción</h1><div className="muted">Planeación de artículos, color, ruta y lotes asignados.</div></div></div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Nueva orden</h2>
        <form action={createProductionOrder} className="form">
          <div className="field"><label>Cliente</label><input name="customerName" placeholder="Opcional" /></div>
          <div className="field"><label>Artículo / código</label><input name="articleCode" required /></div>
          <div className="field"><label>Color objetivo</label><input name="targetColor" /></div>
          <div className="field"><label>Ruta de producción</label><select name="routeId"><option value="">Sin ruta</option>{routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="field"><label>Pieles solicitadas</label><input name="requestedHides" type="number" min="1" /></div>
          <div className="field"><label>Peso solicitado (kg)</label><input name="requestedWeightKg" type="number" min="0" step="0.001" /></div>
          <div className="field"><label>Fecha compromiso</label><input name="dueDate" type="date" /></div>
          <div className="field"><label>Notas</label><input name="notes" /></div>
          <div className="full"><button className="button" type="submit">Crear orden</button></div>
        </form>
      </div>

      <div className="table-wrap">
        <table><thead><tr><th>Folio</th><th>Cliente</th><th>Artículo</th><th>Ruta</th><th>Lotes</th><th>Estado</th><th>Compromiso</th></tr></thead>
        <tbody>{orders.length === 0 ? <tr><td colSpan={7} className="muted">Sin órdenes.</td></tr> : orders.map(o => <tr key={o.id}>
          <td><Link href={`/produccion/ordenes/${o.id}`}><strong>{o.folio}</strong></Link></td><td>{o.customer?.name ?? "—"}</td><td>{o.articleCode ?? "—"}</td><td>{o.route?.name ?? "—"}</td><td>{o._count.lots}</td><td><span className="badge">{o.status}</span></td><td>{o.dueDate?.toLocaleDateString("es-MX") ?? "—"}</td>
        </tr>)}</tbody></table>
      </div>
    </>
  );
}
