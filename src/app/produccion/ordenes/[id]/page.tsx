import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assignLotToOrder } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, availableLots] = await Promise.all([
    prisma.productionOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        route: { include: { steps: { include: { process: true }, orderBy: { sequence: "asc" } } } },
        lots: { include: { processes: { include: { process: true, machine: true, routeStep: true }, orderBy: { createdAt: "asc" } } } }
      }
    }),
    prisma.tanneryLot.findMany({
      where: { productionOrderId: null, status: { in: ["RECEIVED", "IN_PROCESS", "ON_HOLD"] } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (!order) notFound();

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">{order.folio}</h1>
          <div className="muted">{order.articleCode ?? "Sin artículo"} · {order.targetColor ?? "Sin color"} · {order.customer?.name ?? "Sin cliente"}</div>
        </div>
        <Link className="button" href="/produccion/ordenes">Volver</Link>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Estado</div><div className="metric" style={{ fontSize: 20 }}>{order.status}</div></div>
        <div className="card"><div className="muted">Ruta</div><div className="metric" style={{ fontSize: 20 }}>{order.route?.name ?? "Sin ruta"}</div></div>
        <div className="card"><div className="muted">Lotes</div><div className="metric">{order.lots.length}</div></div>
        <div className="card"><div className="muted">Compromiso</div><div className="metric" style={{ fontSize: 20 }}>{order.dueDate?.toLocaleDateString("es-MX") ?? "—"}</div></div>
      </section>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Asignar lote</h2>
        <form action={assignLotToOrder} className="form">
          <input type="hidden" name="orderId" value={order.id} />
          <div className="field full"><label>Lote disponible</label><select name="lotId" required><option value="">Selecciona un lote</option>{availableLots.map(l => <option key={l.id} value={l.id}>{l.folio} · {l.currentHides} pieles · {Number(l.currentWeightKg).toFixed(2)} kg</option>)}</select></div>
          <div className="full"><button className="button" type="submit">Asignar lote y generar ruta</button></div>
        </form>
      </div>

      {order.route && <div className="card" style={{ marginBottom: 22 }}><h2>Ruta planificada</h2><div>{order.route.steps.map((s, i) => <span key={s.id}>{i > 0 ? " → " : ""}{s.sequence}. {s.process.name}</span>)}</div></div>}

      <h2>Lotes de la orden</h2>
      <div className="table-wrap">
        <table><thead><tr><th>Lote</th><th>Pieles</th><th>Peso</th><th>Estado</th><th>Avance de ruta</th></tr></thead>
        <tbody>{order.lots.length === 0 ? <tr><td colSpan={5} className="muted">Aún no hay lotes asignados.</td></tr> : order.lots.map(lot => {
          const planned = lot.processes.filter(p => p.routeStepId);
          const completed = planned.filter(p => p.status === "COMPLETED").length;
          return <tr key={lot.id}><td><Link href={`/lotes/${lot.id}`}><strong>{lot.folio}</strong></Link></td><td>{lot.currentHides}</td><td>{Number(lot.currentWeightKg).toFixed(2)} kg</td><td><span className="badge">{lot.status}</span></td><td>{planned.length ? `${completed}/${planned.length}` : "Sin ruta"}</td></tr>;
        })}</tbody></table>
      </div>
    </>
  );
}
