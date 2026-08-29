import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { EntityDocumentUpload } from "@/components/entity-document-upload";
import { DocumentList } from "@/components/document-list";
import { completeMaintenanceOrder, consumeMaintenancePart, startMaintenanceOrder } from "../actions";

export const dynamic = "force-dynamic";

export default async function MaintenanceOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["MAINTENANCE", "PRODUCTION", "WAREHOUSE"]);
  const { id } = await params;
  const canMaintain = user.roles.includes("ADMIN") || user.roles.includes("MAINTENANCE") || user.roles.includes("PRODUCTION");
  const [order, parts, documents] = await Promise.all([
    prisma.maintenanceWorkOrder.findUnique({
      where: { id },
      include: { machine: true, plan: true, parts: { include: { part: true }, orderBy: { createdAt: "asc" } } }
    }),
    prisma.maintenancePart.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.documentAttachment.findMany({ where: { entityType: "MAINTENANCE_WORK_ORDER", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })
  ]);
  if (!order) notFound();

  return <>
    <div className="header">
      <div><h1 className="title">{order.folio}</h1><div className="muted">Orden de mantenimiento · {order.machine.code} · {order.machine.name}</div></div>
      <Link className="button button-secondary" href="/mantenimiento">Volver</Link>
    </div>

    <section className="cards">
      <div className="card"><div className="muted">Estado</div><div className="metric" style={{ fontSize: 20 }}>{order.status}</div></div>
      <div className="card"><div className="muted">Tipo</div><div className="metric" style={{ fontSize: 20 }}>{order.type}</div></div>
      <div className="card"><div className="muted">Prioridad</div><div className="metric" style={{ fontSize: 20 }}>{order.priority}</div></div>
      <div className="card"><div className="muted">Costo total</div><div className="metric">${Number(order.totalCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div></div>
    </section>

    <div className="grid-2" style={{ marginBottom: 20 }}>
      <div className="card">
        <h2>Trabajo</h2>
        <p><strong>Descripción:</strong> {order.description}</p>
        <p><strong>Técnico:</strong> {order.technicianName ?? "—"}</p>
        <p><strong>Plan:</strong> {order.plan?.name ?? "Sin plan"}</p>
        <p><strong>Programado:</strong> {order.scheduledAt?.toLocaleString("es-MX") ?? "—"}</p>
        <p><strong>Inicio:</strong> {order.startedAt?.toLocaleString("es-MX") ?? "—"}</p>
        <p><strong>Fin:</strong> {order.completedAt?.toLocaleString("es-MX") ?? "—"}</p>
        <p><strong>Resolución:</strong> {order.resolution ?? "—"}</p>
      </div>
      <div className="card">
        <h2>Costos y paro</h2>
        <p><strong>Mano de obra:</strong> ${Number(order.laborCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
        <p><strong>Refacciones:</strong> ${Number(order.partsCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
        <p><strong>Total:</strong> ${Number(order.totalCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
        <p><strong>Tiempo de paro:</strong> {order.downtimeMinutes ?? 0} min</p>
      </div>
    </div>

    {canMaintain && ["OPEN", "SCHEDULED"].includes(order.status) ? <div className="card" style={{ marginBottom: 20 }}>
      <h2>Iniciar intervención</h2>
      <form action={startMaintenanceOrder}><input type="hidden" name="orderId" value={order.id}/><button className="button" type="submit">Iniciar mantenimiento</button></form>
    </div> : null}

    {canMaintain && order.status === "IN_PROGRESS" ? <div className="grid-2" style={{ marginBottom: 20 }}>
      <div className="card">
        <h2>Consumir refacción</h2>
        <form action={consumeMaintenancePart} className="form">
          <input type="hidden" name="workOrderId" value={order.id}/>
          <div className="field full"><label>Refacción</label><select name="partId" required><option value="">Selecciona</option>{parts.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name} · stock {Number(p.currentStock)}</option>)}</select></div>
          <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required/></div>
          <div className="full"><button className="button" type="submit">Consumir</button></div>
        </form>
      </div>
      <div className="card">
        <h2>Cerrar orden</h2>
        <form action={completeMaintenanceOrder} className="form">
          <input type="hidden" name="orderId" value={order.id}/>
          <div className="field full"><label>Resolución</label><textarea name="resolution" required rows={2}/></div>
          <div className="field"><label>Paro min.</label><input name="downtimeMinutes" type="number" min="0"/></div>
          <div className="field"><label>Mano de obra $</label><input name="laborCost" type="number" min="0" step="0.01"/></div>
          <div className="full"><button className="button" type="submit">Completar orden</button></div>
        </form>
      </div>
    </div> : null}

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>Fotografías y documentos</h2>
      {canMaintain ? <EntityDocumentUpload entityType="MAINTENANCE_WORK_ORDER" entityId={order.id} defaultCategory="Evidencia de mantenimiento" camera/> : null}
      <div style={{ marginTop: 16 }}><DocumentList documents={documents}/></div>
    </div>

    <div className="card">
      <h2>Refacciones utilizadas</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Refacción</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th></tr></thead><tbody>
        {order.parts.map(p => <tr key={p.id}><td>{p.createdAt.toLocaleString("es-MX")}</td><td>{p.part.code}</td><td>{p.part.name}</td><td>{Number(p.quantity)} {p.part.unit}</td><td>${Number(p.unitCost).toFixed(2)}</td><td>${Number(p.totalCost).toFixed(2)}</td></tr>)}
        {order.parts.length === 0 ? <tr><td colSpan={6} className="muted">No se han utilizado refacciones.</td></tr> : null}
      </tbody></table></div>
    </div>
  </>;
}
