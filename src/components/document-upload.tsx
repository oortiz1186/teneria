"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DocumentUpload({ entityType, entityId }: { entityType: string; entityId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    formData.set("entityType", entityType);
    formData.set("entityId", entityId);
    const response = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result.error || "No se pudo subir el archivo.");
    else {
      setMessage("Archivo guardado correctamente.");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form action={submit} className="form">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <div className="field"><label>Categoría</label><input name="category" placeholder="Evidencia, factura, foto..." maxLength={80} /></div>
      <div className="field"><label>Archivo</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/xml,text/xml" required /></div>
      <div className="full"><button className="button" disabled={busy} type="submit">{busy ? "Subiendo..." : "Subir documento"}</button></div>
      {message ? <div className="muted full">{message}</div> : null}
    </form>
  );
}
