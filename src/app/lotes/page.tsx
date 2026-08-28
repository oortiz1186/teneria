import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  const lots = await prisma.tanneryLot.findMany({
    orderBy: { createdAt: "desc" },
    include: { receipt: { include: { supplier: true } } }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Lotes</h1>
          <div className="muted">Trazabilidad de piel desde recepción hasta producto terminado</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Folio</th><th>Proveedor</th><th>Tipo</th><th>Pieles</th><th>Peso</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr><td colSpan={6} className="muted">Sin lotes registrados.</td></tr>
            ) : lots.map(lot => (
              <tr key={lot.id}>
                <td>{lot.folio}</td>
                <td>{lot.receipt?.supplier.name ?? "—"}</td>
                <td>{lot.animalType}</td>
                <td>{lot.currentHides}</td>
                <td>{Number(lot.currentWeightKg).toFixed(2)} kg</td>
                <td><span className="badge">{lot.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
