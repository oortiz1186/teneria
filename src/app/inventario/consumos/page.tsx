import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { registerConsumption } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConsumptionPage() {
  const [activeExecutions, chemicalLots, recent] = await Promise.all([
    prisma.lotProcess.findMany({ where: { status: "IN_PROGRESS" }, include: { lot: true, process: true }, orderBy: { startedAt: "asc" } }),
    prisma.chemicalLot.findMany({ where: { currentQuantity: { gt: 0 } }, include: { chemical: true, warehouse: true }, orderBy: [{ chemical: { name: "asc" } }, { expiresAt: "asc" }] }),
    prisma.processChemicalConsumption.findMany({ include: { lotProcess: { include: { lot: true, process: true } }, chemical: true, chemicalLot: true }, orderBy: { createdAt: "desc" }, take: 50 })
  ]);

  return <>
    <div className="header"><div><h1 className="title">Consumo de químicos</h1><div className="muted">Consumo real por proceso con comparación contra la receta y costo por lote.</div></div><Link className="button" href="/inventario">Inventario</Link></div>

    <div className="card" style={{marginBottom:22}}><h2>Registrar consumo</h2><form action={registerConsumption} className="form">
      <div className="field"><label>Proceso activo</label><select name="lotProcessId" required><option value="">Selecciona</option>{activeExecutions.map(e=><option key={e.id} value={e.id}>{e.lot.folio} · {e.process.name}</option>)}</select></div>
      <div className="field"><label>Lote químico</label><select name="chemicalLotId" required><option value="">Selecciona</option>{chemicalLots.map(l=><option key={l.id} value={l.id}>{l.chemical.code} · {l.chemical.name} · lote {l.lotNumber} · {Number(l.currentQuantity).toFixed(3)} {l.chemical.unit}</option>)}</select></div>
      <div className="field"><label>Cantidad real</label><input name="actualQuantity" type="number" min="0.001" step="0.001" required /></div>
      <div className="full"><button className="button">Registrar consumo</button></div>
    </form></div>

    <div className="table-wrap"><table><thead><tr><th>Lote producción</th><th>Proceso</th><th>Químico</th><th>Lote químico</th><th>Teórico</th><th>Real</th><th>Variación</th><th>Costo</th></tr></thead><tbody>
      {recent.length===0?<tr><td colSpan={8} className="muted">Aún no hay consumos registrados.</td></tr>:recent.map(c=>{
        const theoretical=c.theoreticalQuantity==null?null:Number(c.theoreticalQuantity); const actual=Number(c.actualQuantity); const variance=theoretical==null?null:actual-theoretical;
        return <tr key={c.id}><td>{c.lotProcess.lot.folio}</td><td>{c.lotProcess.process.name}</td><td>{c.chemical.code} · {c.chemical.name}</td><td>{c.chemicalLot?.lotNumber??"—"}</td><td>{theoretical==null?"Sin receta":theoretical.toFixed(3)}</td><td>{actual.toFixed(3)}</td><td>{variance==null?"—":`${variance>=0?"+":""}${variance.toFixed(3)}`}</td><td>{c.totalCost?`$${Number(c.totalCost).toFixed(2)}`:"—"}</td></tr>
      })}
    </tbody></table></div>
  </>;
}
