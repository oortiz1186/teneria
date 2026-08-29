import { prisma } from "@/lib/prisma";
import { addDefect, createInspection, resolveInspection } from "./actions";
import { EntityDocumentUpload } from "@/components/entity-document-upload";
import { DocumentList } from "@/components/document-list";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const [lots, inspections, defects] = await Promise.all([
    prisma.tanneryLot.findMany({
      where: { status: { in: ["IN_PROCESS", "ON_HOLD", "COMPLETED"] } },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.qualityInspection.findMany({
      include: { lot: true, process: true, defects: { include: { defect: true } }, evidence: true },
      orderBy: { inspectedAt: "desc" },
      take: 30
    }),
    prisma.qualityDefectCatalog.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);

  const inspectionIds = inspections.map(i => i.id);
  const protectedDocuments = inspectionIds.length ? await prisma.documentAttachment.findMany({
    where: { entityType: "QUALITY_INSPECTION", entityId: { in: inspectionIds }, deletedAt: null },
    orderBy: { createdAt: "desc" }
  }) : [];
  const documentsByInspection = new Map<string, typeof protectedDocuments>();
  for (const doc of protectedDocuments) {
    const list = documentsByInspection.get(doc.entityId) ?? [];
    list.push(doc);
    documentsByInspection.set(doc.entityId, list);
  }

  return (
    <>
      <div className="header"><div><h1 className="title">Calidad</h1><div className="muted">Inspecciones, defectos, clasificación, pruebas, evidencia y liberación de lotes.</div></div></div>

      <section className="cards">
        <div className="card"><div className="muted">Inspecciones</div><div className="metric">{inspections.length}</div></div>
        <div className="card"><div className="muted">Aprobadas</div><div className="metric">{inspections.filter(i => i.status === "APPROVED").length}</div></div>
        <div className="card"><div className="muted">Reproceso</div><div className="metric">{inspections.filter(i => i.status === "REWORK_REQUIRED").length}</div></div>
        <div className="card"><div className="muted">Rechazadas</div><div className="metric">{inspections.filter(i => i.status === "REJECTED").length}</div></div>
      </section>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Nueva inspección</h2>
        <form action={createInspection} className="form">
          <div className="field"><label>Lote</label><select name="lotId" required><option value="">Selecciona un lote</option>{lots.map(l => <option key={l.id} value={l.id}>{l.folio} · {l.currentHides} pieles · {Number(l.currentWeightKg).toFixed(2)} kg</option>)}</select></div>
          <div className="field"><label>Grado / clasificación</label><input name="grade" placeholder="A, B, C, automotriz, calzado..." /></div>
          <div className="field"><label>Espesor (mm)</label><input name="thicknessMm" type="number" step="0.001" /></div>
          <div className="field"><label>Área (dm²)</label><input name="areaDm2" type="number" step="0.001" /></div>
          <div className="field"><label>Color</label><input name="colorResult" placeholder="Conforme / desviación / lectura" /></div>
          <div className="field"><label>Visual</label><input name="visualResult" placeholder="Conforme / observaciones" /></div>
          <div className="field"><label>Resistencia</label><input name="tensileResult" placeholder="Resultado / referencia" /></div>
          <div className="field"><label>Adherencia</label><input name="adhesionResult" /></div>
          <div className="field"><label>Flexión</label><input name="flexResult" /></div>
          <div className="field"><label>Inspector</label><input name="inspectorName" /></div>
          <div className="field full"><label>Observaciones</label><textarea name="notes" rows={3} /></div>
          <div className="full"><button className="button" type="submit">Crear inspección</button></div>
        </form>
      </div>

      <h2>Inspecciones recientes</h2>
      {inspections.length === 0 ? <div className="card muted">Aún no hay inspecciones.</div> : inspections.map(i => {
        const docs = documentsByInspection.get(i.id) ?? [];
        return <div className="card" key={i.id} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div><strong>{i.folio}</strong> · {i.lot.folio} · <span className="badge">{i.status}</span><div className="muted">Grado: {i.grade ?? "—"} · Espesor: {i.thicknessMm ? `${Number(i.thicknessMm).toFixed(3)} mm` : "—"} · Área: {i.areaDm2 ? `${Number(i.areaDm2).toFixed(2)} dm²` : "—"}</div></div>
            <div>{i.inspectorName ?? "Sin inspector"}</div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            <div><strong>Color</strong><div className="muted">{i.colorResult ?? "—"}</div></div>
            <div><strong>Visual</strong><div className="muted">{i.visualResult ?? "—"}</div></div>
            <div><strong>Resistencia</strong><div className="muted">{i.tensileResult ?? "—"}</div></div>
          </div>

          <div style={{ marginTop: 16 }}><strong>Defectos registrados</strong>{i.defects.length === 0 ? <div className="muted">Sin defectos registrados.</div> : <div style={{ marginTop: 8 }}>{i.defects.map(d => <div key={d.id}>• {d.defect.name} · {d.severity} {d.affectedHides ? `· ${d.affectedHides} pieles` : ""}</div>)}</div>}</div>

          {i.status === "DRAFT" && <>
            <form action={addDefect} className="form" style={{ marginTop: 14 }}>
              <input type="hidden" name="inspectionId" value={i.id} />
              <div className="field"><label>Defecto</label><select name="defectId" required><option value="">Selecciona</option>{defects.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div className="field"><label>Severidad</label><select name="severity"><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></div>
              <div className="field"><label>Pieles afectadas</label><input name="affectedHides" type="number" min="0" /></div>
              <div className="field"><label>Área afectada dm²</label><input name="affectedAreaDm2" type="number" step="0.001" min="0" /></div>
              <div className="field full"><label>Notas</label><input name="notes" /></div>
              <div className="full"><button className="button" type="submit">Agregar defecto</button></div>
            </form>

            <div style={{ marginTop: 14 }}>
              <strong>Nueva evidencia</strong>
              <EntityDocumentUpload entityType="QUALITY_INSPECTION" entityId={i.id} defaultCategory="Evidencia de calidad" compact camera />
            </div>

            <form action={resolveInspection} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <input type="hidden" name="inspectionId" value={i.id} />
              <button className="button" name="disposition" value="RELEASE">Liberar</button>
              <button className="button" name="disposition" value="HOLD">Retener</button>
              <button className="button" name="disposition" value="REWORK">Reproceso</button>
              <button className="button" name="disposition" value="REJECT">Rechazar</button>
            </form>
          </>}

          <div style={{ marginTop: 16 }}>
            <strong>Archivos protegidos</strong>
            <div style={{ marginTop: 8 }}><DocumentList documents={docs} emptyText="Sin evidencia protegida." /></div>
          </div>

          {i.evidence.length > 0 && <div style={{ marginTop: 14 }}><strong>Evidencias históricas por URL</strong>{i.evidence.map(e => <div key={e.id}><a href={e.fileUrl} target="_blank" rel="noreferrer">{e.fileName ?? e.fileUrl}</a></div>)}</div>}
        </div>;
      })}
    </>
  );
}
