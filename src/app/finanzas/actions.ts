"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";

export async function createReceivable(formData: FormData) {
  await requireRole(["FINANCE"]);
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

  await prisma.accountReceivable.create({
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
  revalidatePath("/finanzas");
}

export async function registerReceivablePayment(formData: FormData) {
  await requireRole(["FINANCE"]);
  const receivableId = z.string().min(1).parse(formData.get("receivableId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  await prisma.$transaction(async tx => {
    const ar = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    if (!["OPEN", "PARTIALLY_PAID"].includes(ar.status)) throw new Error("La cuenta por cobrar ya no admite pagos.");
    if (amount > Number(ar.balance)) throw new Error("El cobro excede el saldo pendiente.");
    const payment = await tx.payment.create({ data: { folio: createFolio("COB"), direction: "INCOME", method, amount, reference: String(formData.get("reference") || "") || null } });
    const newBalance = Math.max(0, Number(ar.balance) - amount);
    await tx.paymentApplication.create({ data: { paymentId: payment.id, receivableId: ar.id, amount } });
    await tx.accountReceivable.update({ where: { id: ar.id }, data: { balance: newBalance, status: newBalance <= 0.0001 ? "PAID" : "PARTIALLY_PAID" } });
  });
  revalidatePath("/finanzas");
}

export async function registerPayablePayment(formData: FormData) {
  await requireRole(["FINANCE"]);
  const supplierInvoiceId = z.string().min(1).parse(formData.get("supplierInvoiceId"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const method = z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(formData.get("method"));
  await prisma.$transaction(async tx => {
    const ap = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId } });
    if (!["OPEN", "PARTIALLY_PAID"].includes(ap.status)) throw new Error("La cuenta por pagar ya no admite pagos.");
    if (amount > Number(ap.balance)) throw new Error("El pago excede el saldo pendiente.");
    const payment = await tx.payment.create({ data: { folio: createFolio("PAG"), direction: "EXPENSE", method, amount, reference: String(formData.get("reference") || "") || null } });
    const newBalance = Math.max(0, Number(ap.balance) - amount);
    await tx.paymentApplication.create({ data: { paymentId: payment.id, supplierInvoiceId: ap.id, amount } });
    await tx.supplierInvoice.update({ where: { id: ap.id }, data: { balance: newBalance, status: newBalance <= 0.0001 ? "PAID" : "PARTIALLY_PAID" } });
  });
  revalidatePath("/finanzas");
  revalidatePath("/compras");
}

export async function createExpense(formData: FormData) {
  await requireRole(["FINANCE"]);
  const category = z.string().min(1).parse(formData.get("category"));
  const description = z.string().min(1).parse(formData.get("description"));
  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  const tax = z.coerce.number().nonnegative().parse(formData.get("tax") || 0);
  const methodRaw = formData.get("paymentMethod");
  const method = methodRaw ? z.enum(["CASH","TRANSFER","CARD","CHECK","OTHER"]).parse(methodRaw) : undefined;
  await prisma.expense.create({ data: { folio: createFolio("GTO"), category, description, amount, tax, supplierId: String(formData.get("supplierId") || "") || null, paymentMethod: method, reference: String(formData.get("reference") || "") || null } });
  revalidatePath("/finanzas");
}
