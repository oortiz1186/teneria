import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessDocumentType, documentEntityTypes, type DocumentEntityType } from "@/lib/document-access";
import { DocumentCenterUpload } from "@/components/document-center-upload";

export const dynamic = "force-dynamic";

const typeLabels: Record<DocumentEntityType, string> = {
  TANNERY_LOT: "Lote",
  QUALITY_INSPECTION: "Calidad",
  MAINTENANCE_WORK_ORDER: "Mantenimiento",
  SUPPLIER_INVOICE: "Factura proveedor",
  ACCOUNT_RECEIVABLE: "CxC",
  RAW_HIDE_RECEIPT: "Recepción de piel",
  PURCHASE_ORDER: "Orden de compra",
  SALES_ORDER: "Pedido"
};

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default async function DocumentsPage() {
  const user = await requireUser();
  const allowedTypes = documentEntityTypes.filter(type => canAccessDocumentType(user, type));

  const [lots, inspections, maintenance, supplierInvoices, receivables, receipts, purchaseOrders, salesOrders] = await Promise.all([
    allowedTypes.includes("TANNERY_LOT") ? prisma.tanneryLot.findMany({ select: { id: true, folio: true }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("QUALITY_INSPECTION") ? prisma.qualityInspection.findMany({ select: { id: true, folio: true, lot: { select: { folio: true } } }, orderBy: { inspectedAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("MAINTENANCE_WORK_ORDER") ? prisma.maintenanceWorkOrder.findMany({ select: { id: true, folio: true, machine: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("SUPPLIER_INVOICE") ? prisma.supplierInvoice.findMany({ select: { id: true, folio: true, supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("ACCOUNT_RECEIVABLE") ? prisma.accountReceivable.findMany({ select: { id: true, folio: true, customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("RAW_HIDE_RECEIPT") ? prisma.rawHideReceipt.findMany({ select: { id: true, folio: true, supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("PURCHASE_ORDER") ? prisma.purchaseOrder.findMany({ select: { id: true, folio: true, supplier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : [],
    allowedTypes.includes("SALES_ORDER") ? prisma.salesOrder.findMany({ select: { id: true, folio: true, customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 80 }) : []
  ]);

  const options = [
    ...lots.map(x => ({ entityType: "TANNERY_LOT", entityId: x.id, label: `Lote · ${x.folio}` })),
    ...inspections.map(x => ({ entityType: "QUALITY_INSPECTION", entityId: x.id, label: `Calidad · ${x.folio} · ${x.lot.folio}` })),
    ...maintenance.map(x => ({ entityType: "MAINTENANCE_WORK_ORDER", entityId: x.id, label: `Mantenimiento · ${x.folio} · ${x.machine.code}` })),
    ...supplierInvoices.map(x => ({ entityType: "SUPPLIER_INVOICE", entityId: x.id, label: `Factura proveedor · ${x.folio} · ${x.supplier.name}` })),
    ...receivables.map(x => ({ entityType: "ACCOUNT_RECEIVABLE", entityId: x.id, label: `CxC · ${x.folio} · ${x.customer.name}` })),
    ...receipts.map(x => ({ entityType: "RAW_HIDE_RECEIPT", entityId: x.id, label: `Recepción · ${x.folio} · ${x.supplier.name}` })),
    ...purchaseOrders.map(x => ({ entityType: "PURCHASE_ORDER", entityId: x.id, label: `OC · ${x.folio} · ${x.supplier.name}` })),
    ...salesOrders.map(x => ({ entityType: "SALES_ORDER", entityId: x.id, label: `Pedido · ${x.folio} · ${x.customer.name}` }))
  ];

  const documents = await prisma.documentAttachment.findMany({
    where: { deletedAt: null, entityType: { in: allowedTypes } },
    orderBy: { createdAt: "desc" },
    take: 150
  });

  return <>
    <div className="header"><div><h1 className="title">Documentos</h1><div className="muted">Fotos, evidencias, PDF y XML protegidos por usuario y rol.</div></div></div>

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>Subir documento</h2>
      <DocumentCenterUpload options={options} />
      <div className="muted" style={{ marginTop: 10 }}>Formatos permitidos: JPG, PNG, WEBP, PDF y XML. El tamaño máximo se controla con DOCUMENT_MAX_BYTES.</div>
    </div>

    <div className="card">
      <h2>Documentos recientes</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Archivo</th><th>Tamaño</th><th>Usuario</th><th>Integridad</th><th>Acción</th></tr></thead><tbody>
        {documents.map(doc => <tr key={doc.id}>
          <td>{doc.createdAt.toLocaleString("es-MX")}</td>
          <td>{typeLabels[doc.entityType as DocumentEntityType] ?? doc.entityType}</td>
          <td>{doc.category ?? "—"}</td>
          <td>{doc.originalName}</td>
          <td>{sizeLabel(doc.sizeBytes)}</td>
          <td>{doc.uploadedByEmail ?? "Sistema"}</td>
          <td title={doc.sha256}>{doc.sha256.slice(0, 12)}…</td>
          <td><Link className="button button-secondary" href={`/api/documents/${doc.id}`} target="_blank">Abrir</Link></td>
        </tr>)}
        {documents.length === 0 ? <tr><td colSpan={8} className="muted">Aún no hay documentos.</td></tr> : null}
      </tbody></table></div>
    </div>
  </>;
}
