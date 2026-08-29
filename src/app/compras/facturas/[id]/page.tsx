import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { EntityDocumentUpload } from "@/components/entity-document-upload";
import { DocumentList } from "@/components/document-list";

export const dynamic = "force-dynamic";

export default async function SupplierInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["PURCHASING", "FINANCE"]);
  const { id } = await params;
  const [invoice, documents] = await Promise.all([
    prisma.supplierInvoice.findUnique({
      where: { id },
      include: { supplier: true, purchaseOrder: true, payments: { include: { payment: true } } }
    }),
    prisma.documentAttachment.findMany({ where: { entityType: "SUPPLIER_INVOICE", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })
  ]);
  if (!invoice) notFound();
  const payments = [...invoice.payments].sort((a, b) => b.payment.paidAt.getTime() - a.payment.paidAt.getTime());

  return <>
    <div className="header">
      <div><h1 className="title">{invoice.folio}</h1><div className="muted">Factura de proveedor · {invoice.supplier.name}</div></div>
      <Link className="button button-secondary" href="/compras">Volver</Link>
    </div>

    <section className="cards">
      <div className="card"><div className="muted">Total</div><div className="metric">${Number(invoice.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div></div>
      <div className="card"><div className="muted">Saldo</div><div className="metric">${Number(invoice.balance).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div></div>
      <div className="card"><div className="muted">Estado</div><div className="metric" style={{ fontSize: 20 }}>{invoice.status}</div></div>
      <div className="card"><div className="muted">Vencimiento</div><div className="metric" style={{ fontSize: 20 }}>{invoice.dueDate?.toLocaleDateString("es-MX") ?? "—"}</div></div>
    </section>

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>Datos fiscales y compra</h2>
      <p><strong>Proveedor:</strong> {invoice.supplier.name}</p>
      <p><strong>Orden de compra:</strong> {invoice.purchaseOrder?.folio ?? "—"}</p>
      <p><strong>Folio externo:</strong> {invoice.externalFolio ?? "—"}</p>
      <p><strong>UUID:</strong> {invoice.externalUuid ?? "—"}</p>
      <p><strong>Fecha emisión:</strong> {invoice.issuedAt.toLocaleString("es-MX")}</p>
    </div>

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>XML, PDF y soportes</h2>
      <EntityDocumentUpload entityType="SUPPLIER_INVOICE" entityId={invoice.id} defaultCategory="Factura / CFDI" />
      <div style={{ marginTop: 16 }}><DocumentList documents={documents} /></div>
      {(invoice.xmlUrl || invoice.pdfUrl) ? <div className="muted" style={{ marginTop: 12 }}>Esta factura conserva referencias históricas por URL. Los documentos nuevos deben cargarse aquí.</div> : null}
    </div>

    <div className="card">
      <h2>Pagos aplicados</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Folio pago</th><th>Método</th><th>Importe aplicado</th><th>Referencia</th></tr></thead><tbody>
        {payments.map(a => <tr key={a.id}><td>{a.payment.paidAt.toLocaleString("es-MX")}</td><td>{a.payment.folio}</td><td>{a.payment.method}</td><td>${Number(a.amount).toFixed(2)}</td><td>{a.payment.reference ?? "—"}</td></tr>)}
        {payments.length === 0 ? <tr><td colSpan={5} className="muted">Sin pagos aplicados.</td></tr> : null}
      </tbody></table></div>
    </div>
  </>;
}
