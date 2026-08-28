import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [lots, receipts, suppliers, inProcess] = await Promise.all([
    prisma.tanneryLot.count(),
    prisma.rawHideReceipt.count(),
    prisma.supplier.count({ where: { active: true } }),
    prisma.tanneryLot.count({ where: { status: "IN_PROCESS" } })
  ]);

  const recentLots = await prisma.tanneryLot.findMany({
    take: 8,
    orderBy: { createdAt: "desc" }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Dashboard</h1>
          <div className="muted">Control general de operación de la tenería</div>
        </div>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Lotes registrados</div><div className="metric">{lots}</div></div>
        <div className="card"><div className="muted">Lotes en proceso</div><div className="metric">{inProcess}</div></div>
        <div className="card"><div className="muted">Recepciones</div><div className="metric">{receipts}</div></div>
        <div className="card"><div className="muted">Proveedores activos</div><div className="metric">{suppliers}</div></div>
      </section>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Lote</th><th>Tipo</th><th>Pieles</th><th>Peso actual</th><th>Estado</th><th>Proceso</th></tr>
          </thead>
          <tbody>
            {recentLots.length === 0 ? (
              <tr><td colSpan={6} className="muted">Todavía no hay lotes registrados.</td></tr>
            ) : recentLots.map(lot => (
              <tr key={lot.id}>
                <td>{lot.folio}</td>
                <td>{lot.animalType}</td>
                <td>{lot.currentHides}</td>
                <td>{Number(lot.currentWeightKg).toFixed(2)} kg</td>
                <td><span className="badge">{lot.status}</span></td>
                <td>{lot.currentProcessCode ?? "Recepción"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
