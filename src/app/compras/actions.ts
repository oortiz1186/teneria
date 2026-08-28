"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const reqSchema = z.object({
  requester: z.string().optional(),
  description: z.string().min(1),
  chemicalId: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  estimatedUnitCost: z.coerce.number().nonnegative().optional(),
  neededBy: z.string().optional(),
  notes: z.string().optional()
});

export async function createPurchaseRequest(formData: FormData) {
  const rawCost = formData.get("estimatedUnitCost");
  const data = reqSchema.parse({
    requester: formData.get("requester") || undefined,
    description: formData.get("description"),
    chemicalId: formData.get("chemicalId") || undefined,
    quantity: formData.get("quantity"),
    unit: formData.get("unit") || "kg",
    estimatedUnitCost: rawCost === "" ? undefined : rawCost,
    neededBy: formData.get("neededBy") || undefined,
    notes: formData.get("notes") || undefined
  });
  const suffix = `${Date.now()}`.slice(-8);
  await prisma.purchaseRequest.create({
    data: {
      folio: `REQ-${new Date().getFullYear()}-${suffix}`,
      requester: data.requester,
      status: "REQUESTED",
      neededBy: data.neededBy ? new Date(`${data.neededBy}T12:00:00`) : null,
      notes: data.notes,
      items: { create: { description: data.description, chemicalId: data.chemicalId, quantity: data.quantity, unit: data.unit, estimatedUnitCost: data.estimatedUnitCost } }
    }
  });
  revalidatePath("/compras");
}

export async function createPurchaseOrder(formData: FormData) {
  const supplierId = z.string().min(1).parse(formData.get("supplierId"));
  const chemicalId = z.string().optional().parse(formData.get("chemicalId") || undefined);
  const description = z.string().min(1).parse(formData.get("description"));
  const quantity = z.coerce.number().positive().parse(formData.get("quantity"));
  const unit = z.string().min(1).parse(formData.get("unit") || "kg");
  const unitCost = z.coerce.number().nonnegative().parse(formData.get("unitCost"));
  const taxRate = z.coerce.number().min(0).max(100).parse(formData.get("taxRate") || 16);
  const expectedAtRaw = formData.get("expectedAt");
  const subtotal = quantity * unitCost;
  const tax = subtotal * taxRate / 100;
  const total = subtotal + tax;
  const suffix = `${Date.now()}`.slice(-8);
  await prisma.purchaseOrder.create({
    data: {
      folio: `OC-${new Date().getFullYear()}-${suffix}`,
      supplierId,
      status: "ISSUED",
      expectedAt: expectedAtRaw ? new Date(`${String(expectedAtRaw)}T12:00:00`) : null,
      subtotal,
      tax,
      total,
      items: { create: { description, chemicalId, quantity, unit, unitCost, taxRate, subtotal, tax, total } }
    }
  });
  revalidatePath("/compras");
}

export async function receivePurchaseOrder(formData: FormData) {
  const purchaseOrderId = z.string().min(1).parse(formData.get("purchaseOrderId"));
  const itemId = z.string().min(1).parse(formData.get("itemId"));
  const quantity = z.coerce.number().positive().parse(formData.get("quantity"));
  const warehouseId = z.string().optional().parse(formData.get("warehouseId") || undefined);
  const lotNumber = z.string().optional().parse(formData.get("lotNumber") || undefined);
  const expiresAtRaw = formData.get("expiresAt");

  await prisma.$transaction(async tx => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, include: { items: true } });
    const item = order.items.find(i => i.id === itemId);
    if (!item) throw new Error("Partida de compra no encontrada.");
    const pending = Number(item.quantity) - Number(item.receivedQuantity);
    if (quantity > pending) throw new Error("La recepción excede la cantidad pendiente.");

    const suffix = `${Date.now()}`.slice(-8);
    const receipt = await tx.purchaseReceipt.create({
      data: {
        folio: `REC-${new Date().getFullYear()}-${suffix}`,
        purchaseOrderId: order.id,
        supplierId: order.supplierId,
        warehouseId,
        items: { create: { purchaseOrderItemId: item.id, quantity, lotNumber, expiresAt: expiresAtRaw ? new Date(`${String(expiresAtRaw)}T12:00:00`) : null } }
      }
    });

    const newReceived = Number(item.receivedQuantity) + quantity;
    await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQuantity: newReceived } });

    if (item.chemicalId && warehouseId) {
      const chemLotNumber = lotNumber || `OC-${order.folio}-${suffix}`;
      const existing = await tx.chemicalLot.findFirst({ where: { chemicalId: item.chemicalId, warehouseId, lotNumber: chemLotNumber } });
      if (existing) {
        await tx.chemicalLot.update({ where: { id: existing.id }, data: { currentQuantity: Number(existing.currentQuantity) + quantity, initialQuantity: Number(existing.initialQuantity) + quantity } });
      } else {
        await tx.chemicalLot.create({ data: { chemicalId: item.chemicalId, warehouseId, supplierId: order.supplierId, lotNumber: chemLotNumber, initialQuantity: quantity, currentQuantity: quantity, unitCost: item.unitCost, expiresAt: expiresAtRaw ? new Date(`${String(expiresAtRaw)}T12:00:00`) : null, notes: `Recepción ${receipt.folio} de ${order.folio}` } });
      }
      await tx.chemicalStockMovement.create({ data: { chemicalId: item.chemicalId, warehouseId, type: "RECEIPT", quantity, unitCost: item.unitCost, reference: receipt.folio } });
    }

    const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: order.id } });
    const complete = allItems.every(i => Number(i.receivedQuantity) >= Number(i.quantity));
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
  });

  revalidatePath("/compras");
  revalidatePath("/inventario");
}

export async function registerSupplierInvoice(formData: FormData) {
  const supplierId = z.string().min(1).parse(formData.get("supplierId"));
  const purchaseOrderId = z.string().optional().parse(formData.get("purchaseOrderId") || undefined);
  const total = z.coerce.number().positive().parse(formData.get("total"));
  const dueDateRaw = formData.get("dueDate");
  const externalUuid = z.string().optional().parse(formData.get("externalUuid") || undefined);
  const externalFolio = z.string().optional().parse(formData.get("externalFolio") || undefined);
  const suffix = `${Date.now()}`.slice(-8);
  await prisma.supplierInvoice.create({ data: { folio: `FP-${new Date().getFullYear()}-${suffix}`, supplierId, purchaseOrderId, total, balance: total, dueDate: dueDateRaw ? new Date(`${String(dueDateRaw)}T12:00:00`) : null, externalUuid, externalFolio } });
  revalidatePath("/compras");
  revalidatePath("/finanzas");
}
