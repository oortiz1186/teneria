"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function createReceivable(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const customerId = z.string().min(1).parse(formData.get("customerId"));
  const salesOrderId = z.string().optional().parse(formData.get("salesOrderId") || undefined);
  const shipmentId = z.string().optional().parse(formData.get("shipmentId") || undefined);
  const total = z.coerce.number().positive().parse(formData.get("total"));
  const dueDateRaw = formData.get("dueDate");

  if (salesOrderId) {
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
    if (order.customerId !== customerId) throw new Error("El pedido no pertenece al cliente seleccionado.");
  }
  if (shipmentId) {
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    if (shipment.customerId !== customerId) throw new Error("La remisión no pertenece al cliente seleccionado.");
  }

  const receivable = await prisma.accountReceivable.create({
    data: {
      folio: createFolio("CXC"),
      customerId,
      salesOrderId,
      shipmentId,
      total,
      balance: total,
      dueDate: dueDateRaw ? new Date(`${String(dueDateRaw)}T12:00:00`) : null,
      externalFolio: String(formData.get("externalFolio") || "") || null,
      externalUuid: String(formData.get("externalUuid") || "") || null
    }
  });
  await writeAuditLog({ actor, action: "RECEIVABLE_CREATED", entityType: "AccountReceivable", entityId: receivable.id, after: { folio: receivable.folio, customerId, salesOrderId, shipmentId, total: receivable.total, balance: receivable.balance, dueDate: receivable.dueDate } });
  revalidatePath("/finanzas");
}

export async function registerReceivablePayment(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const receivableId = z.string().min(1).parse(formData.get("receivableId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  const result = await prisma.$transaction(async tx => {
    const ar = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    if (!["OPEN", "PARTIALLY_PAID"].includes(ar.status)) throw new Error("La cuenta por cobrar ya no admite pagos.");
    if (amount > Number(ar.balance)) throw new Error("El cobro excede el saldo pendiente.");
    const payment = await tx.payment.create({ data: { folio: createFolio("COB"), direction: "INCOME", method, amount, reference: String(formData.get("reference") || "") || null } });
    const newBalance = Math.max(0, Number(ar.balance) - amount);
    await tx.paymentApplication.create({ data: { paymentId: payment.id, receivableId: ar.id, amount } });
    const updated = await tx.accountReceivable.update({ where: { id: ar.id }, data: { balance: newBalance, status: newBalance <= 0.0001 ? "PAID" : "PARTIALLY_PAID" } });
    return { payment, before: ar, after: updated };
  });
  await writeAuditLog({ actor, action: "RECEIVABLE_PAYMENT_REGISTERED", entityType: "AccountReceivable", entityId: receivableId, before: { balance: result.before.balance, status: result.before.status }, after: { paymentId: result.payment.id, paymentFolio: result.payment.folio, amount, method, balance: result.after.balance, status: result.after.status } });
  revalidatePath("/finanzas");
}

export async function registerPayablePayment(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const supplierInvoiceId = z.string().min(1).parse(formData.get("supplierInvoiceId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  const result = await prisma.$transaction(async tx => {
    const ap = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId } });
    if (!["OPEN", "PARTIALLY_PAID"].includes(ap.status)) throw new Error("La cuenta por pagar ya no admite pagos.");
    if (amount > Number(ap.balance)) throw new Error("El pago excede el saldo pendiente.");
    const payment = await tx.payment.create({ data: { folio: createFolio("PAG"), direction: "EXPENSE", method, amount, reference: String(formData.get("reference") || "") || null } });
    const newBalance = Math.max(0, Number(ap.balance) - amount);
    await tx.paymentApplication.create({ data: { paymentId: payment.id, supplierInvoiceId: ap.id, amount } });
    const updated = await tx.supplierInvoice.update({ where: { id: ap.id }, data: { balance: newBalance, status: newBalance <= 0.0001 ? "PAID" : "PARTIALLY_PAID" } });
    return { payment, before: ap, after: updated };
  });
  await writeAuditLog({ actor, action: "PAYABLE_PAYMENT_REGISTERED", entityType: "SupplierInvoice", entityId: supplierInvoiceId, before: { balance: result.before.balance, status: result.before.status }, after: { paymentId: result.payment.id, paymentFolio: result.payment.folio, amount, method, balance: result.after.balance, status: result.after.status } });
  revalidatePath("/finanzas");
  revalidatePath("/compras");
}

export async function createExpense(formData: FormData) {
  const actor = await requireRole(["FINANCE"]);
  const category = z.string().min(1).parse(formData.get("category"));
  const description = z.string().min(1).parse(formData.get("description"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const tax = z.coerce.number().nonnegative().parse(formData.get("tax") || 0);
  const methodRaw = formData.get("paymentMethod");
  const method = methodRaw ? z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(methodRaw) : undefined;
  const expense = await prisma.expense.create({ data: { folio: createFolio("GTO"), category, description, amount, tax, supplierId: String(formData.get("supplierId") || "") || null, paymentMethod: method, reference: String(formData.get("reference") || "") || null } });
  await writeAuditLog({ actor, action: "EXPENSE_CREATED", entityType: "Expense", entityId: expense.id, after: { folio: expense.folio, category: expense.category, description: expense.description, amount: expense.amount, tax: expense.tax, supplierId: expense.supplierId, paymentMethod: expense.paymentMethod } });
  revalidatePath("/finanzas");
}
