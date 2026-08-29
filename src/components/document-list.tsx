import { DocumentActions, DocumentImagePreview } from "@/components/document-actions";

type DocumentItem = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  uploadedByEmail: string | null;
  createdAt: Date;
  sha256: string;
};

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function DocumentList({ documents, emptyText = "Sin archivos adjuntos." }: { documents: DocumentItem[]; emptyText?: string }) {
  if (documents.length === 0) return <div className="muted">{emptyText}</div>;
  return <div className="table-wrap"><table><thead><tr><th>Vista</th><th>Archivo</th><th>Categoría</th><th>Tamaño</th><th>Usuario</th><th>Fecha</th><th>Acción</th></tr></thead><tbody>
    {documents.map(doc => <tr key={doc.id}>
      <td>{doc.mimeType.startsWith("image/") ? <DocumentImagePreview id={doc.id} name={doc.originalName}/> : <span className="muted">{doc.mimeType === "application/pdf" ? "PDF" : "Archivo"}</span>}</td>
      <td>{doc.originalName}<div className="muted" title={doc.sha256}>{doc.mimeType} · SHA {doc.sha256.slice(0, 10)}…</div></td>
      <td>{doc.category ?? "—"}</td>
      <td>{sizeLabel(doc.sizeBytes)}</td>
      <td>{doc.uploadedByEmail ?? "Sistema"}</td>
      <td>{doc.createdAt.toLocaleString("es-MX")}</td>
      <td><DocumentActions id={doc.id} mimeType={doc.mimeType}/></td>
    </tr>)}
  </tbody></table></div>;
}
