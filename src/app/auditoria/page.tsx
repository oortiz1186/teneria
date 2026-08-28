import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Event = { at: Date; area: string; entity: string; action: string; detail: string };

export default async function AuditPage() {
  await requireRole(["ADMIN"]);
  const [auditLogs, lotMovements, chemicalMovements, inspections, payments] = await Promise.all([
    prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lotMovement.findMany({ include: { lot: true }, orderBy: { occurredAt: "desc" }, take: 40 }),
    prisma.chemicalStockMovement.findMany({ include: { chemical: true }, orderBy: { occurredAt: "desc" }, take: 40 }),
    prisma.qualityInspection.findMany({ include: { lot: true }, orderBy: { inspectedAt: "desc" }, take: 40 }),
    prisma.payment.findMany({ orderBy: { paidAt: "desc" }, take: 40 })
  ]);

  const events: Event[] = [
    ...lotMovements.map(m => ({ at: m.occurredAt, area: "Producción", entity: m.lot.folio, action: m.type, detail: m.reference ?? m.notes ?? "Movimiento de lote" })),
    ...chemicalMovements.map(m => ({ at: m.occurredAt, area: "Inventario", entity: m.chemical.code, action: m.type, detail: `${Number(m.quantity).toFixed(3)} ${m.chemical.unit}` })),
    ...inspections.map(i => ({ at: i.inspectedAt, area: "Calidad", entity: i.lot.folio, action: i.status, detail: i.disposition ? `Disposición: ${i.disposition}` : (i.notes ?? "Inspección") })),
    ...payments.map(p => ({ at: p.paidAt, area: "Finanzas", entity: p.folio, action: p.direction, detail: `${p.method} · ${Number(p.amount).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}` }))
  ].sort((a,b) => b.at.getTime() - a.at.getTime()).slice(0,100);

  return (
    <>
      <div className="header"><div><h1 className="title">Auditoría</h1><div className="muted">Trazabilidad por usuario y cronología operacional.</div></div></div>

      <h2>Auditoría por usuario</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>IP</th><th>Cambios</th></tr></thead>
          <tbody>
            {auditLogs.length === 0 ? <tr><td colSpan={6} className="muted">Aún no hay eventos de auditoría persistente.</td></tr> : auditLogs.map(log => (
              <tr key={log.id}>
                <td>{log.createdAt.toLocaleString("es-MX")}</td>
                <td>{log.user?.name ?? log.userEmail ?? "Sistema"}<div className="muted">{log.userEmail ?? ""}</div></td>
                <td><span className="badge">{log.action}</span></td>
                <td>{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0,10)}…` : ""}</td>
                <td>{log.ipAddress ?? "—"}</td>
                <td><details><summary>Ver detalle</summary><pre style={{ whiteSpace: "pre-wrap", maxWidth: 520 }}>{JSON.stringify({ before: log.beforeJson, after: log.afterJson }, null, 2)}</pre></details></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Cronología operacional</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Área</th><th>Entidad</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{events.length === 0 ? <tr><td colSpan={5} className="muted">Todavía no hay actividad registrada.</td></tr> : events.map((e, index) => <tr key={`${e.area}-${e.entity}-${e.at.getTime()}-${index}`}><td>{e.at.toLocaleString("es-MX")}</td><td>{e.area}</td><td>{e.entity}</td><td><span className="badge">{e.action}</span></td><td>{e.detail}</td></tr>)}</tbody></table></div>
    </>
  );
}
