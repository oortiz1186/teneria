import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { mergeLots, splitLot } from "../actions";

export const dynamic = "force-dynamic";

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await prisma.tanneryLot.findUnique({
    where: { id },
    include: {
      receipt: { include: { supplier: true } },
      productionOrder: true,
      processes: { include: { process: true, machine: true, routeStep: true }, orderBy: { createdAt: "asc" } },
      movements: { include: { warehouse: true }, orderBy: { occurredAt: "asc" } },
      sourceRelations: { include: { childLot: true }, orderBy: { createdAt: "asc" } },
      targetRelations: { include: { parentLot: true }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!lot) notFound();

  const mergeCandidates = await prisma.tanneryLot.findMany({
    where: { id: { not: lot.id }, animalType: lot.animalType, status: { in: ["RECEIVED", "IN_PROCESS", "ON_HOLD"] } },
    orderBy: { createdAt: "desc" }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const qrUrl = `${baseUrl}/lotes/qr/${lot.qrToken}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 240, margin: 1 });

  return (
    <>
      <div className="header">
        <div><h1 className="title">{lot.folio}</h1><div className="muted">Trazabilidad integral del lote</div></div>
        <Link className="button" href="/lotes">Volver</Link>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Estado</div><div className="metric" style={{ fontSize: 20 }}>{lot.status}</div></div>
        <div className="card"><div className="muted">Pieles actuales</div><div className="metric">{lot.currentHides}</div></div>
        <div className="card"><div className="muted">Peso actual</div><div className="metric">{Number(lot.currentWeightKg).toFixed(2)} kg</div></div>
        <div className="card"><div className="muted">Proceso actual</div><div className="metric" style={{ fontSize: 20 }}>{lot.currentProcessCode ?? "Recepción"}</div></div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 22, marginBottom: 22 }}>
        <div className="card">
          <h2>Origen y orden</h2>
          <p><strong>Proveedor:</strong> {lot.receipt?.supplier.name ?? "—"}</p>
          <p><strong>Recepción:</strong> {lot.receipt?.folio ?? "—"}</p>
          <p><strong>Tipo de piel:</strong> {lot.animalType}</p>
          <p><strong>Orden de producción:</strong> {lot.productionOrder ? <Link href={`/produccion/ordenes/${lot.productionOrder.id}`}>{lot.productionOrder.folio}</Link> : "—"}</p>
          <p><strong>Artículo:</strong> {lot.articleCode ?? "—"} &nbsp; <strong>Color:</strong> {lot.color ?? "—"}</p>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <h2>QR del lote</h2>
          <img src={qrDataUrl} alt={`QR ${lot.folio}`} width={200} height={200} />
          <div className="muted" style={{ wordBreak: "break-all", fontSize: 12 }}>{qrUrl}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Dividir lote</h2>
        <form action={splitLot} className="form">
          <input type="hidden" name="lotId" value={lot.id} />
          <div className="field"><label>Pieles a separar</label><input name="hidesQuantity" type="number" min="1" max={Math.max(1, lot.currentHides - 1)} required /></div>
          <div className="field"><label>Peso a separar (kg)</label><input name="weightKg" type="number" min="0.001" step="0.001" max={Math.max(0, Number(lot.currentWeightKg) - 0.001)} required /></div>
          <div className="field full"><label>Notas</label><input name="notes" /></div>
          <div className="full"><button className="button" type="submit">Crear sublote</button></div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Mezclar otro lote en este</h2>
        <form action={mergeLots} className="form">
          <input type="hidden" name="targetLotId" value={lot.id} />
          <div className="field full"><label>Lote origen</label><select name="sourceLotId" required><option value="">Selecciona</option>{mergeCandidates.map(c => <option key={c.id} value={c.id}>{c.folio} · {c.currentHides} pieles · {Number(c.currentWeightKg).toFixed(2)} kg</option>)}</select></div>
          <div className="field full"><label>Notas</label><input name="notes" /></div>
          <div className="full"><button className="button" type="submit">Mezclar lotes</button></div>
        </form>
      </div>

      <h2>Ruta / procesos</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}><table><thead><tr><th>#</th><th>Proceso</th><th>Estado</th><th>Máquina</th><th>Entrada</th><th>Salida</th></tr></thead><tbody>{lot.processes.length === 0 ? <tr><td colSpan={6} className="muted">Sin procesos.</td></tr> : lot.processes.map((p, i) => <tr key={p.id}><td>{p.routeStep?.sequence ?? i + 1}</td><td>{p.process.name}</td><td><span className="badge">{p.status}</span></td><td>{p.machine?.name ?? "—"}</td><td>{p.inputHides ?? "—"} / {p.inputWeightKg ? `${Number(p.inputWeightKg).toFixed(2)} kg` : "—"}</td><td>{p.outputHides ?? "—"} / {p.outputWeightKg ? `${Number(p.outputWeightKg).toFixed(2)} kg` : "—"}</td></tr>)}</tbody></table></div>

      <h2>Genealogía</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}><table><thead><tr><th>Relación</th><th>Lote relacionado</th><th>Pieles</th><th>Peso</th><th>Fecha</th></tr></thead><tbody>{lot.targetRelations.map(r => <tr key={`in-${r.id}`}><td>{r.relationType} ←</td><td><Link href={`/lotes/${r.parentLot.id}`}>{r.parentLot.folio}</Link></td><td>{r.hidesQuantity ?? "—"}</td><td>{r.weightKg ? `${Number(r.weightKg).toFixed(2)} kg` : "—"}</td><td>{r.createdAt.toLocaleString("es-MX")}</td></tr>)}{lot.sourceRelations.map(r => <tr key={`out-${r.id}`}><td>{r.relationType} →</td><td><Link href={`/lotes/${r.childLot.id}`}>{r.childLot.folio}</Link></td><td>{r.hidesQuantity ?? "—"}</td><td>{r.weightKg ? `${Number(r.weightKg).toFixed(2)} kg` : "—"}</td><td>{r.createdAt.toLocaleString("es-MX")}</td></tr>)}{lot.targetRelations.length + lot.sourceRelations.length === 0 && <tr><td colSpan={5} className="muted">Sin relaciones de división o mezcla.</td></tr>}</tbody></table></div>

      <h2>Movimientos</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Almacén</th><th>Pieles</th><th>Peso</th><th>Referencia</th></tr></thead><tbody>{lot.movements.map(m => <tr key={m.id}><td>{m.occurredAt.toLocaleString("es-MX")}</td><td>{m.type}</td><td>{m.warehouse?.name ?? "—"}</td><td>{m.hidesQuantity ?? "—"}</td><td>{m.weightKg ? `${Number(m.weightKg).toFixed(2)} kg` : "—"}</td><td>{m.reference ?? "—"}</td></tr>)}</tbody></table></div>
    </>
  );
}
