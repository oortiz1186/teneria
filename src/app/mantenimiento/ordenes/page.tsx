import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MaintenanceOrdersPage() {
  await requireRole(["MAINTENANCE", "PRODUCTION", "WAREHOUSE"]);
  const orders = await prisma.maintenanceWorkOrder.findMany({
    include: { machine: true, plan: true },
    orderBy: { createdAt: "desc" },
    take: 150
  });

  return <>
    <div className="header">
      <div><h1 className="title">Órdenes de mantenimiento</h1><div className="muted">Historial de intervenciones, costos, refacciones y evidencia documental.</div></div>
      <Link className="button button-secondary" href="/mantenimiento">Mantenimiento</Link>
    </div>
    <div className="card">
      <div className="table-wrap"><table><thead><tr><th>Folio</th><th>Máquina</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Programado</th><th>Técnico</th><th>Costo</th><th>Ficha</th></tr></thead><tbody>
        {orders.map(order => <tr key={order.id}>
          <td><Link href={`/mantenimiento/${order.id}`}>{order.folio}</Link></td>
          <td>{order.machine.code} · {order.machine.name}</td>
          <td>{order.type}</td><td>{order.priority}</td><td>{order.status}</td>
          <td>{order.scheduledAt?.toLocaleString("es-MX") ?? "—"}</td>
          <td>{order.technicianName ?? "—"}</td>
          <td>${Number(order.totalCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
          <td><Link className="button button-secondary" href={`/mantenimiento/${order.id}`}>Abrir</Link></td>
        </tr>)}
        {orders.length === 0 ? <tr><td colSpan={9} className="muted">Aún no hay órdenes.</td></tr> : null}
      </tbody></table></div>
    </div>
  </>;
}
