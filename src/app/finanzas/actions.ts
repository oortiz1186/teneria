"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

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
    }

    const receivable = await tx.accountReceivable.create({
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

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "RECEIVABLE_CREATED",
      entityType: "AccountReceivable",
      entityId: receivable.id,
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
    const changed = await tx.accountReceivable.updateMany({
      where: { id: receivableId, status: { in: ["OPEN", "PARTIALLY_PAID"] }, balance: { gte: amount } },
      data: { balance: { decrement: amount } }
    });
    if (changed.count !== 1) throw new Error("El saldo cambió mientras registrabas el cobro o ya no admite pagos. Actualiza la pantalla e intenta de nuevo.");

    const payment = await tx.payment.create({ data: { folio: createFolio("COB"), direction: "INCOME", method, amount, reference } });
    await tx.paymentApplication.create({ data: { paymentId: payment.id, receivableId, amount } });

    const current = await tx.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    const finalStatus = Number(current.balance) <= 0.0001 ? "PAID" : "PARTIALLY_PAID";
    const after = await tx.accountReceivable.update({ where: { id: receivableId }, data: { status: finalStatus } });

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "RECEIVABLE_PAYMENT_REGISTERED",
      entityType: "AccountReceivable",
      entityId: receivableId,
      before: { balance: before.balance, status: before.status },
      after: { paymentId: payment.id, paymentFolio: payment.folio, amount, method, balance: after.balance, status: after.status }
    });
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
    const changed = await tx.supplierInvoice.updateMany({
      where: { id: supplierInvoiceId, status: { in: ["OPEN", "PARTIALLY_PAID"] }, balance: { gte: amount } },
      data: { balance: { decrement: amount } }
    });
    if (changed.count !== 1) throw new Error("El saldo cambió mientras registrabas el pago o ya no admite pagos. Actualiza la pantalla e intenta de nuevo.");

    const payment = await tx.payment.create({ data: { folio: createFolio("PAG"), direction: "EXPENSE", method, amount, reference } });
    await tx.paymentApplication.create({ data: { paymentId: payment.id, supplierInvoiceId, amount } });

    const current = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: supplierInvoiceId } });
    const finalStatus = Number(current.balance) <= 0.0001 ? "PAID" : "PARTIALLY_PAID";
    const after = await tx.supplierInvoice.update({ where: { id: supplierInvoiceId }, data: { status: finalStatus } });

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "PAYABLE_PAYMENT_REGISTERED",
      entityType: "SupplierInvoice",
      entityId: supplierInvoiceId,
      before: { balance: before.balance, status: before.status },
      after: { paymentId: payment.id, paymentFolio: payment.folio, amount, method, balance: after.balance, status: after.status }
    });
  });

  revalidatePath("/finanzas");
  revalidatePath("/compras");
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
    const expense = await tx.expense.create({
      data: {
        folio: createFolio("GTO"),
        category,
        description,
        amount,
        tax,
        supplierId: String(formData.get("supplierId") || "") || null,
        paymentMethod: method,
        reference: String(formData.get("reference") || "") || null
      }
    });

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "EXPENSE_CREATED",
      entityType: "Expense",
      entityId: expense.id,
      after: { folio: expense.folio, category: expense.category, description: expense.description, amount: expense.amount, tax: expense.tax, supplierId: expense.supplierId, paymentMethod: expense.paymentMethod }
    });
  });

  revalidatePath("/finanzas");
}
