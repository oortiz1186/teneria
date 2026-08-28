import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addRecipeItem, createRecipe } from "../actions";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const [recipes, processes, chemicals] = await Promise.all([
    prisma.recipe.findMany({ include: { process: true, items: { include: { chemical: true }, orderBy: { sequence: "asc" } } }, orderBy: [{process:{sequence:"asc"}}, {version:"desc"}] }),
    prisma.processCatalog.findMany({ where: { active: true }, orderBy: { sequence: "asc" } }),
    prisma.chemicalProduct.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);

  return <>
    <div className="header"><div><h1 className="title">Recetas de proceso</h1><div className="muted">Fórmulas versionadas por proceso. El porcentaje se calcula sobre el peso de entrada del lote.</div></div><Link className="button" href="/inventario">Inventario</Link></div>

    <div className="card" style={{marginBottom:22}}><h2>Nueva receta</h2><form action={createRecipe} className="form">
      <div className="field"><label>Código</label><input name="code" required placeholder="CURT-BASE-V1" /></div>
      <div className="field"><label>Nombre</label><input name="name" required /></div>
      <div className="field"><label>Proceso</label><select name="processId" required><option value="">Selecciona</option>{processes.map(p=><option key={p.id} value={p.id}>{p.sequence}. {p.name}</option>)}</select></div>
      <div className="full"><button className="button">Crear receta</button></div>
    </form></div>

    <div className="card" style={{marginBottom:22}}><h2>Agregar componente</h2><form action={addRecipeItem} className="form">
      <div className="field"><label>Receta</label><select name="recipeId" required><option value="">Selecciona</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></div>
      <div className="field"><label>Químico</label><select name="chemicalId" required><option value="">Selecciona</option>{chemicals.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
      <div className="field"><label>Secuencia</label><input name="sequence" type="number" min="1" required /></div>
      <div className="field"><label>Base</label><select name="basis"><option value="WEIGHT_PERCENT">% sobre peso</option><option value="FIXED_QUANTITY">Cantidad fija</option></select></div>
      <div className="field"><label>Valor</label><input name="quantity" type="number" min="0.0001" step="0.0001" required /></div>
      <div className="field"><label>Tolerancia %</label><input name="tolerancePercent" type="number" min="0" step="0.001" /></div>
      <div className="full"><button className="button">Agregar componente</button></div>
    </form></div>

    {recipes.length===0?<div className="card muted">No hay recetas.</div>:recipes.map(r=><div key={r.id} className="card" style={{marginBottom:16}}><h2>{r.code} · {r.name}</h2><div className="muted">Proceso: {r.process.name} · Versión {r.version} · {r.active?"Activa":"Inactiva"}</div><div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>#</th><th>Químico</th><th>Base</th><th>Valor</th><th>Tolerancia</th></tr></thead><tbody>{r.items.length===0?<tr><td colSpan={5} className="muted">Sin componentes.</td></tr>:r.items.map(i=><tr key={i.id}><td>{i.sequence}</td><td>{i.chemical.code} · {i.chemical.name}</td><td>{i.basis==="WEIGHT_PERCENT"?"% peso":"Fijo"}</td><td>{Number(i.quantity).toFixed(4)}</td><td>{i.tolerancePercent?`${Number(i.tolerancePercent).toFixed(2)}%`:"—"}</td></tr>)}</tbody></table></div></div>)}
  </>;
}
