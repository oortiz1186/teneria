import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createChemical, receiveChemical } from "./actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [chemicals, warehouses, suppliers, lots] = await Promise.all([
    prisma.chemicalProduct.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { lots: true } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.chemicalLot.findMany({ include: { chemical: true, warehouse: true, supplier: true }, orderBy: { receivedAt: "desc" }, take: 50 })
  ]);

  return <>
    <div className="header"><div><h1 className="title">Inventario químico</h1><div className="muted">Existencias por lote, proveedor, almacén, costo y caducidad.</div></div><Link className="button" href="/inventario/recetas">Recetas</Link></div>

    <section className="cards">
      <div className="card"><div className="muted">Químicos activos</div><div className="metric">{chemicals.length}</div></div>
      <div className="card"><div className="muted">Lotes físicos</div><div className="metric">{lots.length}</div></div>
      <div className="card"><div className="muted">Bajo mínimo</div><div className="metric">{chemicals.filter(c => c.minStock != null && c.lots.reduce((a,l)=>a+Number(l.currentQuantity),0) < Number(c.minStock)).length}</div></div>
      <div className="card"><div className="muted">Próximos a caducar (30 días)</div><div className="metric">{lots.filter(l => l.expiresAt && l.expiresAt.getTime() <= Date.now()+30*86400000 && l.currentQuantity.toNumber()>0).length}</div></div>
    </section>

    <div className="card" style={{marginBottom:22}}><h2>Nuevo químico</h2><form action={createChemical} className="form">
      <div className="field"><label>Código</label><input name="code" required /></div>
      <div className="field"><label>Nombre</label><input name="name" required /></div>
      <div className="field"><label>Categoría</label><input name="category" placeholder="Curtiente, ácido, colorante..." /></div>
      <div className="field"><label>Unidad</label><select name="unit"><option value="kg">kg</option><option value="L">L</option><option value="g">g</option></select></div>
      <div className="field"><label>Existencia mínima</label><input type="number" step="0.001" min="0" name="minStock" /></div>
      <div className="full"><button className="button">Guardar químico</button></div>
    </form></div>

    <div className="card" style={{marginBottom:22}}><h2>Entrada de químico</h2><form action={receiveChemical} className="form">
      <div className="field"><label>Químico</label><select name="chemicalId" required><option value="">Selecciona</option>{chemicals.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
      <div className="field"><label>Almacén</label><select name="warehouseId" required><option value="">Selecciona</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></div>
      <div className="field"><label>Proveedor</label><select name="supplierId"><option value="">Sin proveedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field"><label>Lote del proveedor</label><input name="lotNumber" required /></div>
      <div className="field"><label>Cantidad</label><input name="quantity" type="number" min="0.001" step="0.001" required /></div>
      <div className="field"><label>Costo unitario</label><input name="unitCost" type="number" min="0" step="0.0001" /></div>
      <div className="field"><label>Caducidad</label><input name="expiresAt" type="date" /></div>
      <div className="full"><button className="button">Registrar entrada</button></div>
    </form></div>

    <h2>Existencias</h2><div className="table-wrap"><table><thead><tr><th>Químico</th><th>Lote</th><th>Almacén</th><th>Proveedor</th><th>Existencia</th><th>Costo</th><th>Caducidad</th></tr></thead><tbody>
      {lots.length===0?<tr><td colSpan={7} className="muted">Sin existencias registradas.</td></tr>:lots.map(l=><tr key={l.id}><td>{l.chemical.code} · {l.chemical.name}</td><td>{l.lotNumber}</td><td>{l.warehouse.name}</td><td>{l.supplier?.name??"—"}</td><td>{Number(l.currentQuantity).toFixed(3)} {l.chemical.unit}</td><td>{l.unitCost?`$${Number(l.unitCost).toFixed(4)}`:"—"}</td><td>{l.expiresAt?l.expiresAt.toLocaleDateString("es-MX"):"—"}</td></tr>)}
    </tbody></table></div>
  </>;
}
