"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { getAuditContext, writeAuditLog, writeAuditLogWithClient } from "@/lib/audit";

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.enum(["PIECE", "KG", "DM2", "FT2"]),
  basePrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(100),
  routeId: z.string().optional(),
  description: z.string().optional()
});

const quoteSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  validUntil: z.string().optional(),
  notes: z.string().optional()
});

export async function createCustomer(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const name = z.string().min(2).parse(formData.get("name"));
  const taxId = z.string().optional().parse(formData.get("taxId") || undefined);
  const phone = z.string().optional().parse(formData.get("phone") || undefined);
  const email = z.string().optional().parse(formData.get("email") || undefined);
  const customer = await prisma.customer.create({ data: { code: createFolio("CLI"), name: name.trim(), taxId, phone, email } });
  await writeAuditLog({ actor, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id, after: { code: customer.code, name: customer.name, taxId: customer.taxId, email: customer.email } });
  revalidatePath("/ventas");
}

export async function createCommercialProduct(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const data = productSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    basePrice: formData.get("basePrice"),
    taxRate: formData.get("taxRate"),
    routeId: formData.get("routeId") || undefined,
    description: formData.get("description") || undefined
  });

  const product = await prisma.commercialProduct.create({ data: { ...data, code: data.code.trim().toUpperCase(), routeId: data.routeId || null } });
  await writeAuditLog({ actor, action: "COMMERCIAL_PRODUCT_CREATED", entityType: "CommercialProduct", entityId: product.id, after: { code: product.code, name: product.name, unit: product.unit, basePrice: product.basePrice, taxRate: product.taxRate } });
  revalidatePath("/ventas");
}

export async function createQuote(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const data = quoteSchema.parse({
    customerId: formData.get("customerId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
    validUntil: formData.get("validUntil") || undefined,
    notes: formData.get("notes") || undefined
  });

  const product = await prisma.commercialProduct.findUniqueOrThrow({ where: { id: data.productId } });
  const subtotal = data.quantity * data.unitPrice;
  const tax = subtotal * (Number(product.taxRate) / 100);
  const total = subtotal + tax;

  const quote = await prisma.salesQuote.create({
    data: {
      folio: createFolio("COT"),
      customerId: data.customerId,
      validUntil: data.validUntil ? new Date(`${data.validUntil}T12:00:00`) : null,
      subtotal,
      tax,
      total,
      notes: data.notes,
      items: { create: { productId: product.id, description: product.name, quantity: data.quantity, unitPrice: data.unitPrice, subtotal, tax, total } }
    }
  });

  await writeAuditLog({ actor, action: "SALES_QUOTE_CREATED", entityType: "SalesQuote", entityId: quote.id, after: { folio: quote.folio, customerId: quote.customerId, subtotal: quote.subtotal, tax: quote.tax, total: quote.total } });
  revalidatePath("/ventas");
}

export async function markQuoteSent(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const quoteId = z.string().min(1).parse(formData.get("quoteId"));
  const before = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quoteId } });
  const after = await prisma.salesQuote.update({ where: { id: quoteId }, data: { status: "SENT" } });
  await writeAuditLog({ actor, action: "SALES_QUOTE_SENT", entityType: "SalesQuote", entityId: quoteId, before: { status: before.status }, after: { status: after.status, folio: after.folio } });
  revalidatePath("/ventas");
}

export async function acceptQuoteAndCreateOrder(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const quoteId = z.string().min(1).parse(formData.get("quoteId"));

  const result = await prisma.$transaction(async (tx) => {
    const quote = await tx.salesQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: true, salesOrder: true } });
    if (quote.salesOrder) throw new Error("La cotización ya tiene pedido.");
    if (!["DRAFT", "SENT"].includes(quote.status)) throw new Error("La cotización no está disponible para aceptación.");

    await tx.salesQuote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    const order = await tx.salesOrder.create({
      data: {
        folio: createFolio("PED"),
        customerId: quote.customerId,
        quoteId: quote.id,
        status: "DRAFT",
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
        notes: quote.notes,
        items: { create: quote.items.map(item => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal, tax: item.tax, total: item.total })) }
      }
    });
    return { quoteStatusBefore: quote.status, quoteFolio: quote.folio, order };
  });

  await writeAuditLog({ actor, action: "SALES_QUOTE_ACCEPTED", entityType: "SalesQuote", entityId: quoteId, before: { status: result.quoteStatusBefore }, after: { status: "ACCEPTED", salesOrderId: result.order.id, salesOrderFolio: result.order.folio } });
  revalidatePath("/ventas");
}

export async function confirmSalesOrder(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const salesOrderId = z.string().min(1).parse(formData.get("salesOrderId"));

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId }, include: { items: { include: { product: true } }, productionOrders: true } });
    if (order.status !== "DRAFT") throw new Error("El pedido ya fue confirmado o cerrado.");
    if (order.productionOrders.length > 0) throw new Error("El pedido ya tiene órdenes de producción asociadas.");

    const productionOrders = [];
    for (const item of order.items) {
      const op = await tx.productionOrder.create({
        data: {
          folio: createFolio("OP"),
          customerId: order.customerId,
          salesOrderId: order.id,
          routeId: item.product.routeId,
          articleCode: item.product.code,
          requestedHides: item.product.unit === "PIECE" ? Math.round(Number(item.quantity)) : null,
          requestedWeightKg: item.product.unit === "KG" ? item.quantity : null,
          status: "RELEASED",
          notes: `Generada desde pedido ${order.folio}. Cantidad comercial: ${item.quantity} ${item.product.unit}`
        }
      });
      productionOrders.push({ id: op.id, folio: op.folio });
    }

    const updated = await tx.salesOrder.update({ where: { id: order.id }, data: { status: "IN_PRODUCTION" } });
    return { beforeStatus: order.status, order: updated, productionOrders };
  });

  await writeAuditLog({ actor, action: "SALES_ORDER_CONFIRMED", entityType: "SalesOrder", entityId: salesOrderId, before: { status: result.beforeStatus }, after: { status: result.order.status, productionOrders: result.productionOrders } });
  revalidatePath("/ventas");
  revalidatePath("/produccion/ordenes");
}

export async function createShipment(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const auditContext = await getAuditContext();
  const salesOrderId = z.string().min(1).parse(formData.get("salesOrderId"));
  const lotId = z.string().min(1).parse(formData.get("lotId"));
  const productId = z.string().min(1).parse(formData.get("productId"));
  const quantity = z.coerce.number().positive().parse(formData.get("quantity"));

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${salesOrderId} FOR UPDATE`;

    const order = await tx.salesOrder.findUniqueOrThrow({
      where: { id: salesOrderId },
      include: { items: true }
    });
    if (["DRAFT", "CANCELLED", "SHIPPED"].includes(order.status)) {
      throw new Error("El pedido no está disponible para remisión.");
    }

    const orderItem = order.items.find(item => item.productId === productId);
    if (!orderItem) throw new Error("El producto no pertenece al pedido seleccionado.");

    const lot = await tx.tanneryLot.findUniqueOrThrow({
      where: { id: lotId },
      include: { productionOrder: true }
    });
    if (lot.status !== "COMPLETED") throw new Error("Sólo se pueden remisionar lotes liberados/terminados.");
    if (lot.productionOrder?.salesOrderId !== order.id) throw new Error("El lote no pertenece a este pedido.");
    if (lot.productionOrder.articleCode && lot.productionOrder.articleCode !== orderItem.description && lot.productionOrder.articleCode !== undefined) {
      const product = await tx.commercialProduct.findUniqueOrThrow({ where: { id: productId } });
      if (lot.productionOrder.articleCode !== product.code) throw new Error("El lote terminado corresponde a otro producto del pedido.");
    }

    const shippedForProduct = await tx.shipmentItem.aggregate({
      where: {
        productId,
        shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } }
      },
      _sum: { quantity: true }
    });
    const alreadyShipped = Number(shippedForProduct._sum.quantity ?? 0);
    const orderedQuantity = Number(orderItem.quantity);
    const remaining = Math.max(0, orderedQuantity - alreadyShipped);
    if (quantity > remaining + 0.000001) {
      throw new Error(`La cantidad excede el pendiente del producto. Pendiente: ${remaining.toFixed(3)}.`);
    }

    const product = await tx.commercialProduct.findUniqueOrThrow({ where: { id: productId } });
    if (product.unit === "PIECE" && quantity > lot.currentHides) {
      throw new Error(`La remisión excede las ${lot.currentHides} piezas disponibles en el lote.`);
    }
    if (product.unit === "KG" && quantity > Number(lot.currentWeightKg) + 0.000001) {
      throw new Error(`La remisión excede los ${Number(lot.currentWeightKg).toFixed(3)} kg disponibles en el lote.`);
    }

    const shippedFromLot = await tx.shipmentItem.aggregate({
      where: {
        lotId,
        shipment: { status: { not: "CANCELLED" } }
      },
      _sum: { quantity: true }
    });
    const lotAlreadyShipped = Number(shippedFromLot._sum.quantity ?? 0);
    const lotCapacity = product.unit === "PIECE" ? lot.currentHides : product.unit === "KG" ? Number(lot.currentWeightKg) : null;
    if (lotCapacity !== null && lotAlreadyShipped + quantity > lotCapacity + 0.000001) {
      throw new Error(`La cantidad acumulada excede la disponibilidad del lote. Disponible restante: ${Math.max(0, lotCapacity - lotAlreadyShipped).toFixed(3)}.`);
    }

    const shipment = await tx.shipment.create({
      data: {
        folio: createFolio("REM"),
        salesOrderId: order.id,
        customerId: order.customerId,
        status: "ISSUED",
        shippedAt: new Date(),
        items: { create: { productId, lotId, quantity } }
      }
    });

    const shipmentTotals = await tx.shipmentItem.groupBy({
      by: ["productId"],
      where: { shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } } },
      _sum: { quantity: true }
    });
    const shippedMap = new Map(shipmentTotals.map(row => [row.productId, Number(row._sum.quantity ?? 0)]));
    const allFulfilled = order.items.every(item => (shippedMap.get(item.productId) ?? 0) + 0.000001 >= Number(item.quantity));
    const anyShipped = shipmentTotals.some(row => Number(row._sum.quantity ?? 0) > 0);
    const nextStatus = allFulfilled ? "SHIPPED" : anyShipped ? "PARTIALLY_SHIPPED" : order.status;

    await tx.salesOrder.update({ where: { id: order.id }, data: { status: nextStatus } });
    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "SHIPMENT_CREATED",
      entityType: "Shipment",
      entityId: shipment.id,
      before: { salesOrderStatus: order.status, alreadyShipped, remaining },
      after: { folio: shipment.folio, salesOrderId, lotId, productId, quantity, salesOrderStatus: nextStatus }
    });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/ventas");
}
