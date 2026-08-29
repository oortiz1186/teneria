"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  entityType: string;
  entityId: string;
  defaultCategory?: string;
  compact?: boolean;
  camera?: boolean;
};

export function EntityDocumentUpload({ entityType, entityId, defaultCategory = "Evidencia", compact = false, camera = false }: Props) {
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
    if (!response.ok) setMessage(result.error || "No se pudo guardar el archivo.");
    else {
      setMessage("Archivo guardado.");
      router.refresh();
    }
    setBusy(false);
  }

  return <form action={submit} className="form" style={compact ? { marginTop: 10 } : undefined}>
    <div className="field"><label>Categoría</label><input name="category" defaultValue={defaultCategory} maxLength={80}/></div>
    <div className="field"><label>{camera ? "Foto / archivo" : "Archivo"}</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/xml,text/xml" {...(camera ? { capture: "environment" as const } : {})} required/></div>
    <div className="full"><button className="button" disabled={busy} type="submit">{busy ? "Subiendo..." : camera ? "Tomar/subir evidencia" : "Adjuntar archivo"}</button></div>
    {message ? <div className="muted full">{message}</div> : null}
  </form>;
}
