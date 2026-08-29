import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { EntityDocumentUpload } from "@/components/entity-document-upload";
import { DocumentList } from "@/components/document-list";

export const dynamic = "force-dynamic";

export default async function ReceivableDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["SALES", "FINANCE"]);
  const { id } = await params;
  const [receivable, documents] = await Promise.all([
    prisma.accountReceivable.findUnique({
      where: { id },
      include: { customer: true, salesOrder: true, shipment: true, payments: { include: { payment: true } } }
    }),
    prisma.documentAttachment.findMany({ where: { entityType: "ACCOUNT_RECEIVABLE", entityId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })
  ]);
  if (!receivable) notFound();
  const payments = [...receivable.payments].sort((a, b) => b.payment.paidAt.getTime() - a.payment.paidAt.getTime());

  return <>
    <div className="header">
      <div><h1 className="title">{receivable.folio}</h1><div className="muted">Cuenta por cobrar · {receivable.customer.name}</div></div>
      <Link className="button button-secondary" href="/finanzas">Volver</Link>
    </div>

    <section className="cards">
      <div className="card"><div className="muted">Total</div><div className="metric">${Number(receivable.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div></div>
      <div className="card"><div className="muted">Saldo</div><div className="metric">${Number(receivable.balance).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div></div>
      <div className="card"><div className="muted">Estado</div><div className="metric" style={{ fontSize: 20 }}>{receivable.status}</div></div>
      <div className="card"><div className="muted">Vencimiento</div><div className="metric" style={{ fontSize: 20 }}>{receivable.dueDate?.toLocaleDateString("es-MX") ?? "—"}</div></div>
    </section>

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>Origen y referencias</h2>
      <p><strong>Cliente:</strong> {receivable.customer.name}</p>
      <p><strong>Pedido:</strong> {receivable.salesOrder?.folio ?? "—"}</p>
      <p><strong>Remisión:</strong> {receivable.shipment?.folio ?? "—"}</p>
      <p><strong>Folio externo:</strong> {receivable.externalFolio ?? "—"}</p>
      <p><strong>UUID:</strong> {receivable.externalUuid ?? "—"}</p>
      <p><strong>Fecha emisión:</strong> {receivable.issuedAt.toLocaleString("es-MX")}</p>
    </div>

    <div className="card" style={{ marginBottom: 20 }}>
      <h2>CFDI, PDF y soportes</h2>
      <EntityDocumentUpload entityType="ACCOUNT_RECEIVABLE" entityId={receivable.id} defaultCategory="CFDI / Cobranza" />
      <div style={{ marginTop: 16 }}><DocumentList documents={documents} /></div>
      {(receivable.xmlUrl || receivable.pdfUrl) ? <div className="muted" style={{ marginTop: 12 }}>Se conservan referencias históricas por URL; los documentos nuevos deben adjuntarse aquí.</div> : null}
    </div>

    <div className="card">
      <h2>Cobros aplicados</h2>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Folio pago</th><th>Método</th><th>Importe aplicado</th><th>Referencia</th></tr></thead><tbody>
        {payments.map(a => <tr key={a.id}><td>{a.payment.paidAt.toLocaleString("es-MX")}</td><td>{a.payment.folio}</td><td>{a.payment.method}</td><td>${Number(a.amount).toFixed(2)}</td><td>{a.payment.reference ?? "—"}</td></tr>)}
        {payments.length === 0 ? <tr><td colSpan={5} className="muted">Sin cobros aplicados.</td></tr> : null}
      </tbody></table></div>
    </div>
  </>;
}
