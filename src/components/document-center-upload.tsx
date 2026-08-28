"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Option = { entityType: string; entityId: string; label: string };

export function DocumentCenterUpload({ options }: { options: Option[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useMemo(() => options.find(o => `${o.entityType}|${o.entityId}` === selected), [options, selected]);

  async function submit(formData: FormData) {
    if (!current) return setMessage("Selecciona el registro relacionado.");
    setBusy(true);
    setMessage("");
    formData.set("entityType", current.entityType);
    formData.set("entityId", current.entityId);
    const response = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result.error || "No se pudo subir el archivo.");
    else { setMessage("Documento guardado."); router.refresh(); }
    setBusy(false);
  }

  return <form action={submit} className="form">
    <div className="field full"><label>Relacionar con</label><select value={selected} onChange={e => setSelected(e.target.value)} required><option value="">Selecciona</option>{options.map(o => <option key={`${o.entityType}-${o.entityId}`} value={`${o.entityType}|${o.entityId}`}>{o.label}</option>)}</select></div>
    <div className="field"><label>Categoría</label><input name="category" placeholder="Foto, evidencia, factura..." maxLength={80}/></div>
    <div className="field"><label>Archivo</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/xml,text/xml" required/></div>
    <div className="full"><button className="button" disabled={busy || !current} type="submit">{busy ? "Subiendo..." : "Subir documento"}</button></div>
    {message ? <div className="muted full">{message}</div> : null}
  </form>;
}
