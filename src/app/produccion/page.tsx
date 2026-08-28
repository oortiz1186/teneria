import { prisma } from "@/lib/prisma";
import { completeProcess, startProcess } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const [lots, processes, machines, activeExecutions, recentExecutions] = await Promise.all([
    prisma.tanneryLot.findMany({
      where: { status: { in: ["RECEIVED", "IN_PROCESS", "ON_HOLD"] } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.processCatalog.findMany({ where: { active: true }, orderBy: { sequence: "asc" } }),
    prisma.machine.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.lotProcess.findMany({
      where: { status: "IN_PROGRESS" },
      include: { lot: true, process: true, machine: true },
      orderBy: { startedAt: "asc" }
    }),
    prisma.lotProcess.findMany({
      where: { status: "COMPLETED" },
      include: { lot: true, process: true, machine: true },
      orderBy: { completedAt: "desc" },
      take: 12
    })
  ]);

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Producción</h1>
          <div className="muted">Control de procesos, bombos/máquinas, pesos, pieles y merma por lote.</div>
        </div>
      </div>

      <section className="cards">
        <div className="card"><div className="muted">Lotes disponibles</div><div className="metric">{lots.length}</div></div>
        <div className="card"><div className="muted">Procesos activos</div><div className="metric">{activeExecutions.length}</div></div>
        <div className="card"><div className="muted">Máquinas disponibles</div><div className="metric">{machines.filter(m => m.status === "AVAILABLE").length}</div></div>
        <div className="card"><div className="muted">Procesos terminados</div><div className="metric">{recentExecutions.length}</div></div>
      </section>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Iniciar proceso</h2>
        <form action={startProcess} className="form">
          <div className="field">
            <label>Lote</label>
            <select name="lotId" required>
              <option value="">Selecciona un lote</option>
              {lots.map(lot => <option key={lot.id} value={lot.id}>{lot.folio} · {lot.currentHides} pieles · {Number(lot.currentWeightKg).toFixed(2)} kg</option>)}
            </select>
          </div>

          <div className="field">
            <label>Proceso</label>
            <select name="processId" required>
              <option value="">Selecciona un proceso</option>
              {processes.map(p => <option key={p.id} value={p.id}>{p.sequence}. {p.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Bombo / Máquina</label>
            <select name="machineId">
              <option value="">Sin máquina</option>
              {machines.filter(m => m.status === "AVAILABLE").map(m => <option key={m.id} value={m.id}>{m.code} · {m.name} · {m.type}</option>)}
            </select>
          </div>

          <div className="full"><button type="submit" className="button">Iniciar proceso</button></div>
        </form>
      </div>

      <h2>En proceso</h2>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        <table>
          <thead><tr><th>Lote</th><th>Proceso</th><th>Máquina</th><th>Entrada</th><th>Inicio</th><th>Finalizar</th></tr></thead>
          <tbody>
            {activeExecutions.length === 0 ? <tr><td colSpan={6} className="muted">No hay procesos activos.</td></tr> : activeExecutions.map(ex => (
              <tr key={ex.id}>
                <td>{ex.lot.folio}</td>
                <td>{ex.process.name}</td>
                <td>{ex.machine?.name ?? "—"}</td>
                <td>{ex.inputHides ?? 0} pieles / {Number(ex.inputWeightKg ?? 0).toFixed(2)} kg</td>
                <td>{ex.startedAt?.toLocaleString("es-MX")}</td>
                <td style={{ minWidth: 360 }}>
                  <form action={completeProcess} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
                    <input type="hidden" name="executionId" value={ex.id} />
                    <input name="outputHides" type="number" min="0" max={ex.lot.currentHides} defaultValue={ex.lot.currentHides} placeholder="Pieles salida" required />
                    <input name="outputWeightKg" type="number" min="0" step="0.001" defaultValue={Number(ex.lot.currentWeightKg)} placeholder="Peso salida kg" required />
                    <input name="temperatureC" type="number" step="0.01" placeholder="Temperatura °C" />
                    <input name="ph" type="number" step="0.01" placeholder="pH" />
                    <input name="notes" placeholder="Observaciones" style={{ gridColumn: "1 / -1" }} />
                    <button className="button" style={{ gridColumn: "1 / -1" }} type="submit">Finalizar proceso</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Historial reciente</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Lote</th><th>Proceso</th><th>Máquina</th><th>Entrada</th><th>Salida</th><th>Merma peso</th><th>Finalizado</th></tr></thead>
          <tbody>
            {recentExecutions.length === 0 ? <tr><td colSpan={7} className="muted">Aún no hay procesos terminados.</td></tr> : recentExecutions.map(ex => {
              const input = Number(ex.inputWeightKg ?? 0);
              const output = Number(ex.outputWeightKg ?? 0);
              const loss = input - output;
              const pct = input > 0 ? (loss / input) * 100 : 0;
              return <tr key={ex.id}>
                <td>{ex.lot.folio}</td><td>{ex.process.name}</td><td>{ex.machine?.name ?? "—"}</td>
                <td>{ex.inputHides ?? 0} / {input.toFixed(2)} kg</td>
                <td>{ex.outputHides ?? 0} / {output.toFixed(2)} kg</td>
                <td>{loss.toFixed(2)} kg ({pct.toFixed(1)}%)</td>
                <td>{ex.completedAt?.toLocaleString("es-MX")}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
