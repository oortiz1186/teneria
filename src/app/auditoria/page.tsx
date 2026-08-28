import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Event = { at: Date; area: string; entity: string; action: string; detail: string };

export default async function AuditPage() {
  const [lotMovements, chemicalMovements, inspections, payments] = await Promise.all([
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
      <div className="header"><div><h1 className="title">Auditoría operacional</h1><div className="muted">Cronología consolidada de movimientos críticos registrados por los módulos del ERP.</div></div></div>
      <div className="card" style={{ marginBottom: 22 }}><strong>Alcance actual</strong><div className="muted">Esta vista consolida la evidencia que ya existe en producción, inventario, calidad y finanzas. En una fase de endurecimiento se agregará auditoría de usuario/campo antes-después cuando se active autenticación completa.</div></div>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Área</th><th>Entidad</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{events.length === 0 ? <tr><td colSpan={5} className="muted">Todavía no hay actividad registrada.</td></tr> : events.map((e, index) => <tr key={`${e.area}-${e.entity}-${e.at.getTime()}-${index}`}><td>{e.at.toLocaleString("es-MX")}</td><td>{e.area}</td><td>{e.entity}</td><td><span className="badge">{e.action}</span></td><td>{e.detail}</td></tr>)}</tbody></table></div>
    </>
  );
}
