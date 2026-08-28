import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  completeMaintenanceOrder,
  consumeMaintenancePart,
  createMaintenanceOrder,
  createMaintenancePart,
  createMaintenancePlan,
  receiveMaintenancePart,
  startMaintenanceOrder
} from "./actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  OPEN: "Abierta",
  SCHEDULED: "Programada",
  IN_PROGRESS: "En proceso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada"
};

const priorityLabel: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica"
};

export default async function MaintenancePage() {
  await requireRole(["MAINTENANCE", "PRODUCTION", "WAREHOUSE"]);
  const now = new Date();
  const [machines, plans, orders, parts] = await Promise.all([
    prisma.machine.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.maintenancePlan.findMany({ include: { machine: true }, orderBy: [{ active: "desc" }, { nextDueAt: "asc" }] }),
    prisma.maintenanceWorkOrder.findMany({ include: { machine: true, plan: true, parts: { include: { part: true } } }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.maintenancePart.findMany({ where: { active: true }, orderBy: { code: "asc" } })
  ]);

  const openOrders = orders.filter(o => ["OPEN", "SCHEDULED", "IN_PROGRESS"].includes(o.status));
  const duePlans = plans.filter(p => p.active && p.nextDueAt && p.nextDueAt <= now);
  const lowParts = parts.filter(p => p.minStock != null && Number(p.currentStock) <= Number(p.minStock));
  const downtime = orders.filter(o => o.status === "COMPLETED").reduce((sum, o) => sum + Number(o.downtimeMinutes ?? 0), 0);

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Mantenimiento</h1>
          <div className="muted">Preventivo, correctivo, tiempos de paro, costos y refacciones.</div>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="card"><div className="muted">Órdenes abiertas</div><div className="kpi">{openOrders.length}</div></div>
        <div className="card"><div className="muted">Planes vencidos</div><div className="kpi">{duePlans.length}</div></div>
        <div className="card"><div className="muted">Refacciones en mínimo</div><div className="kpi">{lowParts.length}</div></div>
        <div className="card"><div className="muted">Paro acumulado</div><div className="kpi">{Math.round(downtime / 60)} h</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2>Nuevo plan preventivo</h2>
          <form action={createMaintenancePlan} className="form">
            <div className="field full"><label>Máquina</label><select name="machineId" required><option value="">Selecciona</option>{machines.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></div>
            <div className="field full"><label>Plan</label><input name="name" required placeholder="Lubricación general" /></div>
            <div className="field"><label>Cada días</label><input name="frequencyDays" type="number" min="1" /></div>
            <div className="field"><label>Cada horas</label><input name="frequencyHours" type="number" min="1" /></div>
            <div className="field"><label>Próxima fecha</label><input name="nextDueAt" type="date" /></div>
            <div className="field full"><label>Descripción</label><textarea name="description" rows={2} /></div>
            <div className="full"><button className="button" type="submit">Crear plan</button></div>
          </form>
        </div>

        <div className="card">
          <h2>Nueva orden de mantenimiento</h2>
          <form action={createMaintenanceOrder} className="form">
            <div className="field full"><label>Máquina</label><select name="machineId" required><option value="">Selecciona</option>{machines.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name} · {m.status}</option>)}</select></div>
            <div className="field"><label>Tipo</label><select name="type" defaultValue="PREVENTIVE"><option value="PREVENTIVE">Preventivo</option><option value="CORRECTIVE">Correctivo</option><option value="INSPECTION">Inspección</option></select></div>
            <div className="field"><label>Prioridad</label><select name="priority" defaultValue="MEDIUM"><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></div>
            <div className="field full"><label>Plan relacionado</label><select name="planId"><option value="">Sin plan</option>{plans.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.machine.code} · {p.name}</option>)}</select></div>
            <div className="field full"><label>Trabajo requerido</label><textarea name="description" rows={2} required /></div>
            <div className="field"><label>Técnico</label><input name="technicianName" /></div>
            <div className="field"><label>Programar</label><input name="scheduledAt" type="datetime-local" /></div>
            <div className="full"><button className="button" type="submit">Crear orden</button></div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Órdenes activas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Folio</th><th>Máquina</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Trabajo</th><th>Acción</th></tr></thead>
            <tbody>
              {openOrders.map(order => (
                <tr key={order.id}>
                  <td>{order.folio}</td><td>{order.machine.code}</td><td>{order.type}</td><td>{priorityLabel[order.priority]}</td><td>{statusLabel[order.status]}</td><td>{order.description}</td>
                  <td>
                    {order.status !== "IN_PROGRESS" ? (
                      <form action={startMaintenanceOrder}><input type="hidden" name="orderId" value={order.id} /><button className="button" type="submit">Iniciar</button></form>
                    ) : (
                      <details>
                        <summary>Cerrar orden</summary>
                        <form action={completeMaintenanceOrder} className="form" style={{ marginTop: 10, minWidth: 280 }}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <div className="field full"><label>Resolución</label><textarea name="resolution" required rows={2} /></div>
                          <div className="field"><label>Paro min.</label><input name="downtimeMinutes" type="number" min="0" /></div>
                          <div className="field"><label>Mano de obra $</label><input name="laborCost" type="number" min="0" step="0.01" /></div>
                          <div className="full"><button className="button" type="submit">Completar</button></div>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
              {openOrders.length === 0 ? <tr><td colSpan={7} className="muted">No hay órdenes activas.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2>Alta de refacción</h2>
          <form action={createMaintenancePart} className="form">
            <div className="field"><label>Código</label><input name="code" required /></div>
            <div className="field"><label>Nombre</label><input name="name" required /></div>
            <div className="field"><label>Unidad</label><input name="unit" defaultValue="pz" required /></div>
            <div className="field"><label>Stock inicial</label><input name="currentStock" type="number" min="0" step="0.001" /></div>
            <div className="field"><label>Stock mínimo</label><input name="minStock" type="number" min="0" step="0.001" /></div>
            <div className="field"><label>Costo unitario</label><input name="unitCost" type="number" min="0" step="0.0001" /></div>
            <div className="full"><button className="button" type="submit">Guardar refacción</button></div>
          </form>
        </div>
        <div className="card">
          <h2>Entrada de refacción</h2>
          <form action={receiveMaintenancePart} className="form">
            <div className="field full"><label>Refacción</label><select name="partId" required><option value="">Selecciona</option>{parts.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name} · {Number(p.currentStock)} {p.unit}</option>)}</select></div>
            <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required /></div>
            <div className="field"><label>Costo unitario</label><input name="unitCost" type="number" min="0" step="0.0001" /></div>
            <div className="full"><button className="button" type="submit">Registrar entrada</button></div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Consumir refacción en orden activa</h2>
        <form action={consumeMaintenancePart} className="form">
          <div className="field"><label>Orden</label><select name="workOrderId" required><option value="">Selecciona</option>{openOrders.filter(o => o.status === "IN_PROGRESS").map(o => <option key={o.id} value={o.id}>{o.folio} · {o.machine.code}</option>)}</select></div>
          <div className="field"><label>Refacción</label><select name="partId" required><option value="">Selecciona</option>{parts.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name} · stock {Number(p.currentStock)}</option>)}</select></div>
          <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required /></div>
          <div className="full"><button className="button" type="submit">Consumir</button></div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Planes preventivos</h2>
        <div className="table-wrap"><table><thead><tr><th>Máquina</th><th>Plan</th><th>Frecuencia</th><th>Último</th><th>Próximo</th><th>Estado</th></tr></thead><tbody>{plans.map(p => <tr key={p.id}><td>{p.machine.code}</td><td>{p.name}</td><td>{p.frequencyDays ? `${p.frequencyDays} días` : p.frequencyHours ? `${p.frequencyHours} horas` : "-"}</td><td>{p.lastPerformedAt?.toLocaleDateString("es-MX") ?? "-"}</td><td>{p.nextDueAt?.toLocaleDateString("es-MX") ?? "-"}</td><td>{p.nextDueAt && p.nextDueAt <= now ? "VENCIDO" : p.active ? "Activo" : "Inactivo"}</td></tr>)}</tbody></table></div>
      </div>

      <div className="card">
        <h2>Refacciones</h2>
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Refacción</th><th>Existencia</th><th>Mínimo</th><th>Costo</th><th>Alerta</th></tr></thead><tbody>{parts.map(p => { const low = p.minStock != null && Number(p.currentStock) <= Number(p.minStock); return <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{Number(p.currentStock)} {p.unit}</td><td>{p.minStock == null ? "-" : Number(p.minStock)}</td><td>${Number(p.unitCost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td><td>{low ? "REABASTECER" : "OK"}</td></tr>; })}</tbody></table></div>
      </div>
    </>
  );
}
