"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DocumentActions({ id, mimeType }: { id: string; mimeType: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isImage = mimeType.startsWith("image/");
  const canPreview = isImage || mimeType === "application/pdf";

  async function remove() {
    if (!window.confirm("¿Eliminar este documento? La operación quedará registrada en auditoría.")) return;
    setBusy(true);
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return window.alert(result.error || "No se pudo eliminar el documento.");
    router.refresh();
  }

  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    <a className="button button-secondary" href={`/api/documents/${id}${canPreview ? "?inline=1" : ""}`} target="_blank" rel="noreferrer">{canPreview ? "Ver" : "Abrir"}</a>
    <button className="button button-secondary" type="button" onClick={remove} disabled={busy}>{busy ? "Eliminando..." : "Eliminar"}</button>
  </div>;
}

export function DocumentImagePreview({ id, name }: { id: string; name: string }) {
  return <a href={`/api/documents/${id}?inline=1`} target="_blank" rel="noreferrer" style={{ display: "inline-block" }}>
    <img src={`/api/documents/${id}?inline=1`} alt={name} loading="lazy" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6 }} />
  </a>;
}
