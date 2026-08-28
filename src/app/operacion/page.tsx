import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const money = (value: unknown) => Number(value ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default async function OperationPage() {
  const [machines, activeProcesses, pendingQuality, lowStockProducts, waterEntries, energyEntries, recentMovements, maintenanceOrders] = await Promise.all([
    prisma.machine.findMany({ orderBy: { code: "asc" } }),
    prisma.lotProcess.findMany({ where: { status: "IN_PROGRESS" }, include: { lot: true, process: true, machine: true }, orderBy: { startedAt: "asc" } }),
    prisma.qualityInspection.count({ where: { status: { in: ["DRAFT", "CONDITIONAL", "REWORK_REQUIRED"] } } }),
    prisma.chemicalProduct.findMany({ where: { active: true }, include: { lots: true }, orderBy: { name: "asc" } }),
    prisma.lotCostEntry.findMany({ where: { category: "WATER" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lotCostEntry.findMany({ where: { category: "ENERGY" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lotMovement.findMany({ include: { lot: true }, orderBy: { occurredAt: "desc" }, take: 12 }),
    prisma.maintenanceWorkOrder.findMany({ where: { status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS"] } }, select: { id: true, machineId: true, folio: true, status: true, priority: true } })
  ]);

  const lowStock = lowStockProducts.filter(product => {
    const stock = product.lots.reduce((sum, lot) => sum + Number(lot.currentQuantity), 0);
    return product.minStock != null && stock <= Number(product.minStock);
  });
  const waterCost = waterEntries.reduce((sum, e) => sum + Number(e.totalCost), 0);
  const energyCost = energyEntries.reduce((sum, e) => sum + Number(e.totalCost), 0);
  const available = machines.filter(m => m.status === "AVAILABLE").length;
  const maintenance = machines.filter(m => m.status === "MAINTENANCE").length;

  return (
    <>
      <div className="header">
        <div><h1 className="title">Operación de piso</h1><div className="muted">Producción activa, equipos, alertas y seguimiento operativo.</div></div>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Procesos activos</div><div className="metric">{activeProcesses.length}</div></div>
        <div className="card"><div className="muted">Máquinas disponibles</div><div className="metric">{available}</div></div>
        <div className="card"><div className="muted">En mantenimiento</div><div className="metric">{maintenance}</div></div>
        <div className="card"><div className="muted">Órdenes mantenimiento</div><div className="metric">{maintenanceOrders.length}</div></div>
      </section>

      <div className="quick-grid">
        <Link className="quick-card" href="/produccion"><strong>Producción</strong><span>Iniciar y cerrar procesos</span></Link>
        <Link className="quick-card" href="/calidad"><strong>Calidad</strong><span>{pendingQuality} inspecciones por revisar</span></Link>
        <Link className="quick-card" href="/inventario"><strong>Inventario</strong><span>{lowStock.length} productos en mínimo</span></Link>
        <Link className="quick-card" href="/mantenimiento"><strong>Mantenimiento</strong><span>{maintenanceOrders.length} órdenes activas</span></Link>
      </div>

      <h2>Procesos activos</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}><table><thead><tr><th>Lote</th><th>Proceso</th><th>Máquina</th><th>Inicio</th></tr></thead><tbody>{activeProcesses.length === 0 ? <tr><td colSpan={4} className="muted">No hay procesos activos.</td></tr> : activeProcesses.map(p => <tr key={p.id}><td><Link href={`/lotes/${p.lotId}`}>{p.lot.folio}</Link></td><td>{p.process.name}</td><td>{p.machine?.code ?? "—"}</td><td>{p.startedAt?.toLocaleString("es-MX") ?? "—"}</td></tr>)}</tbody></table></div>

      <h2>Máquinas</h2>
      <div className="machine-grid">{machines.map(machine => {
        const work = maintenanceOrders.find(o => o.machineId === machine.id);
        return <div className="card" key={machine.id}><div className="machine-head"><div><strong>{machine.code}</strong><div className="muted">{machine.name}</div></div><span className="badge">{machine.status}</span></div><div className="muted" style={{ margin: "10px 0" }}>Capacidad: {machine.capacityKg ? `${Number(machine.capacityKg).toFixed(0)} kg` : "—"}</div>{work ? <div className="muted">Orden activa: {work.folio} · {work.status} · {work.priority}</div> : machine.status === "IN_USE" ? <div className="muted">Equipo actualmente en producción.</div> : <Link className="button" href="/mantenimiento">Crear orden de mantenimiento</Link>}</div>;
      })}</div>

      <h2>Indicadores ambientales operativos</h2>
      <section className="cards">
        <div className="card"><div className="muted">Costo registrado de agua</div><div className="metric">{money(waterCost)}</div></div>
        <div className="card"><div className="muted">Costo registrado de energía</div><div className="metric">{money(energyCost)}</div></div>
        <div className="card"><div className="muted">Registros de agua</div><div className="metric">{waterEntries.length}</div></div>
        <div className="card"><div className="muted">Registros de energía</div><div className="metric">{energyEntries.length}</div></div>
      </section>
      <div className="muted" style={{ marginBottom: 22 }}>En esta etapa los indicadores ambientales se alimentan de los costos WATER y ENERGY registrados por lote. Después se podrán conectar medidores y lecturas físicas.</div>

      <h2>Actividad reciente</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Lote</th><th>Movimiento</th><th>Referencia</th></tr></thead><tbody>{recentMovements.map(m => <tr key={m.id}><td>{m.occurredAt.toLocaleString("es-MX")}</td><td>{m.lot.folio}</td><td>{m.type}</td><td>{m.reference ?? m.notes ?? "—"}</td></tr>)}</tbody></table></div>
    </>
  );
}
