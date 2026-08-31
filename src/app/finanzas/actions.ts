"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

const reasonSchema = z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres.").max(500);

function receivableStatus(total: number, balance: number) {
  if (balance <= 0.0001) return "PAID" as const;
  if (balance >= total - 0.0001) return "OPEN" as const;
  return "PARTIALLY_PAID" as const;
}

function payableStatus(total: number, balance: number) {
  if (balance <= 0.0001) return "PAID" as const;
  if (balance >= total - 0.0001) return "OPEN" as const;
  return "PARTIALLY_PAID" as const;
}

export async function createReceivable(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const customerId = z.string().min(1).parse(formData.get("customerId"));
  const salesOrderId = z.string().optional().parse(formData.get("salesOrderId") || undefined);
  const shipmentId = z.string().optional().parse(formData.get("shipmentId") || undefined);
  const total = z.coerce.number().positive().parse(formData.get("total"));
  const dueDateRaw = formData.get("dueDate");

  await prisma.$transaction(async tx => {
    if (salesOrderId) {
      const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
      if (order.customerId !== customerId) throw new Error("El pedido no pertenece al cliente seleccionado.");
    }
    if (shipmentId) {
      const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
      if (shipment.customerId !== customerId) throw new Error("La remisión no pertenece al cliente seleccionado.");
      if (shipment.status === "CANCELLED") throw new Error("No se puede crear CxC para una remisión cancelada.");
    }

    const receivable = await tx.accountReceivable.create({
      data: {
        folio: createFolio("CXC"), customerId, salesOrderId, shipmentId, total, balance: total,
        dueDate: dueDateRaw ? new Date(`${String(dueDateRaw)}T12:00:00`) : null,
        externalFolio: String(formData.get("externalFolio") || "") || null,
        externalUuid: String(formData.get("externalUuid") || "") || null
      }
    });

    await writeAuditLogWithClient(tx, {
      actor, context: auditContext, action: "RECEIVABLE_CREATED", entityType: "AccountReceivable", entityId: receivable.id,
      after: { folio: receivable.folio, customerId, salesOrderId, shipmentId, total: receivable.total, balance: receivable.balance, dueDate: receivable.dueDate }
    });
  });
  revalidatePath("/finanzas");
}

export async function registerReceivablePayment(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const receivableId = z.string().min(1).parse(formData.get("receivableId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  const reference = String(formData.get("reference") || "") || null;

  await prisma.$transaction(async tx => {
    const before = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    const changed = await tx.accountReceivable.updateMany({ where: { id: receivableId, status: { in: ["OPEN", "PARTIALLY_PAID"] }, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
    if (changed.count !== 1) throw new Error("El saldo cambió mientras registrabas el cobro o ya no admite pagos. Actualiza la pantalla e intenta de nuevo.");

    const payment = await tx.payment.create({ data: { folio: createFolio("COB"), direction: "INCOME", method, amount, reference } });
    await tx.paymentApplication.create({ data: { paymentId: payment.id, receivableId, amount } });
    const current = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    const after = await tx.accountReceivable.update({ where: { id: receivableId }, data: { status: receivableStatus(Number(current.total), Number(current.balance)) } });

    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "RECEIVABLE_PAYMENT_REGISTERED", entityType: "AccountReceivable", entityId: receivableId, before: { balance: before.balance, status: before.status }, after: { paymentId: payment.id, paymentFolio: payment.folio, amount, method, reference, balance: after.balance, status: after.status } });
  });
  revalidatePath("/finanzas");
}

export async function registerPayablePayment(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const supplierInvoiceId = z.string().min(1).parse(formData.get("supplierInvoiceId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  const reference = String(formData.get("reference") || "") || null;

  await prisma.$transaction(async tx => {
    const before = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId } });
    const changed = await tx.supplierInvoice.updateMany({ where: { id: supplierInvoiceId, status: { in: ["OPEN", "PARTIALLY_PAID"] }, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
    if (changed.count !== 1) throw new Error("El saldo cambió mientras registrabas el pago o ya no admite pagos. Actualiza la pantalla e intenta de nuevo.");

    const payment = await tx.payment.create({ data: { folio: createFolio("PAG"), direction: "EXPENSE", method, amount, reference } });
    await tx.paymentApplication.create({ data: { paymentId: payment.id, supplierInvoiceId, amount } });
    const current = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId } });
    const after = await tx.supplierInvoice.update({ where: { id: supplierInvoiceId }, data: { status: payableStatus(Number(current.total), Number(current.balance)) } });

    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "PAYABLE_PAYMENT_REGISTERED", entityType: "SupplierInvoice", entityId: supplierInvoiceId, before: { balance: before.balance, status: before.status }, after: { paymentId: payment.id, paymentFolio: payment.folio, amount, method, reference, balance: after.balance, status: after.status } });
  });
  revalidatePath("/finanzas"); revalidatePath("/compras");
}

export async function reversePayment(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const paymentId = z.string().min(1).parse(formData.get("paymentId"));
  const reason = reasonSchema.parse(formData.get("reason"));

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { applications: true } });
    if (payment.applications.length !== 1) throw new Error("Sólo se pueden reversar movimientos con una aplicación única.");
    const app = payment.applications[0];
    const amount = Number(app.amount);

    if (app.receivableId) {
      await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id = ${app.receivableId} FOR UPDATE`;
      const before = await tx.accountReceivable.findUniqueOrThrow({ where: { id: app.receivableId } });
      if (before.status === "CANCELLED") throw new Error("No se puede reversar un cobro sobre una CxC cancelada.");
      const newBalance = Math.min(Number(before.total), Number(before.balance) + amount);
      const after = await tx.accountReceivable.update({ where: { id: before.id }, data: { balance: newBalance, status: receivableStatus(Number(before.total), newBalance) } });
      await tx.payment.delete({ where: { id: payment.id } });
      await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "RECEIVABLE_PAYMENT_REVERSED", entityType: "AccountReceivable", entityId: before.id, before: { paymentId: payment.id, paymentFolio: payment.folio, method: payment.method, reference: payment.reference, amount: payment.amount, balance: before.balance, status: before.status }, after: { reason, balance: after.balance, status: after.status } });
    } else if (app.supplierInvoiceId) {
      await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${app.supplierInvoiceId} FOR UPDATE`;
      const before = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: app.supplierInvoiceId } });
      if (before.status === "CANCELLED") throw new Error("No se puede reversar un pago sobre una factura cancelada.");
      const newBalance = Math.min(Number(before.total), Number(before.balance) + amount);
      const after = await tx.supplierInvoice.update({ where: { id: before.id }, data: { balance: newBalance, status: payableStatus(Number(before.total), newBalance) } });
      await tx.payment.delete({ where: { id: payment.id } });
      await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "PAYABLE_PAYMENT_REVERSED", entityType: "SupplierInvoice", entityId: before.id, before: { paymentId: payment.id, paymentFolio: payment.folio, method: payment.method, reference: payment.reference, amount: payment.amount, balance: before.balance, status: before.status }, after: { reason, balance: after.balance, status: after.status } });
    } else {
      throw new Error("El movimiento no tiene una aplicación financiera válida.");
    }
  }, { isolationLevel: "Serializable" });

  revalidatePath("/finanzas"); revalidatePath("/compras");
}

export async function cancelReceivable(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const receivableId = z.string().min(1).parse(formData.get("receivableId"));
  const reason = reasonSchema.parse(formData.get("reason"));

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id = ${receivableId} FOR UPDATE`;
    const before = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId }, include: { payments: true } });
    if (before.status === "CANCELLED") throw new Error("La CxC ya está cancelada.");
    if (before.payments.length > 0) throw new Error("La CxC tiene cobros aplicados. Revértelos antes de cancelar.");
    const after = await tx.accountReceivable.update({ where: { id: receivableId }, data: { status: "CANCELLED", notes: [before.notes, `CANCELACIÓN: ${reason}`].filter(Boolean).join("\n") } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "RECEIVABLE_CANCELLED", entityType: "AccountReceivable", entityId: receivableId, before: { status: before.status, balance: before.balance }, after: { status: after.status, balance: after.balance, reason } });
  }, { isolationLevel: "Serializable" });
  revalidatePath("/finanzas");
}

export async function cancelSupplierInvoice(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const supplierInvoiceId = z.string().min(1).parse(formData.get("supplierInvoiceId"));
  const reason = reasonSchema.parse(formData.get("reason"));

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${supplierInvoiceId} FOR UPDATE`;
    const before = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId }, include: { payments: true } });
    if (before.status === "CANCELLED") throw new Error("La factura ya está cancelada.");
    if (before.payments.length > 0) throw new Error("La factura tiene pagos aplicados. Revértelos antes de cancelar.");
    const after = await tx.supplierInvoice.update({ where: { id: supplierInvoiceId }, data: { status: "CANCELLED", notes: [before.notes, `CANCELACIÓN: ${reason}`].filter(Boolean).join("\n") } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "SUPPLIER_INVOICE_CANCELLED", entityType: "SupplierInvoice", entityId: supplierInvoiceId, before: { status: before.status, balance: before.balance }, after: { status: after.status, balance: after.balance, reason } });
  }, { isolationLevel: "Serializable" });
  revalidatePath("/finanzas"); revalidatePath("/compras");
}

export async function createExpense(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const auditContext = await getAuditContext();
  const category = z.string().min(1).parse(formData.get("category"));
  const description = z.string().min(1).parse(formData.get("description"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const tax = z.coerce.number().nonnegative().parse(formData.get("tax") || 0);
  const methodRaw = formData.get("paymentMethod");
  const method = methodRaw ? z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(methodRaw) : undefined;

  await prisma.$transaction(async tx => {
    const expense = await tx.expense.create({ data: { folio: createFolio("GTO"), category, description, amount, tax, supplierId: String(formData.get("supplierId") || "") || null, paymentMethod: method, reference: String(formData.get("reference") || "") || null } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "EXPENSE_CREATED", entityType: "Expense", entityId: expense.id, after: { folio: expense.folio, category: expense.category, description: expense.description, amount: expense.amount, tax: expense.tax, supplierId: expense.supplierId, paymentMethod: expense.paymentMethod } });
  });
  revalidatePath("/finanzas");
}
