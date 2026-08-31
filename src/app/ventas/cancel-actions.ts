"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

const cancelShipmentSchema = z.object({
  shipmentId: z.string().min(1),
  reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres.").max(500)
});

export async function cancelShipment(formData: FormData) {
  const actor = await requireRole(["SALES"]);
  const auditContext = await getAuditContext();
  const data = cancelShipmentSchema.parse({
    shipmentId: formData.get("shipmentId"),
    reason: formData.get("reason")
  });

  await prisma.$transaction(async tx => {
    const shipmentRef = await tx.shipment.findUniqueOrThrow({ where: { id: data.shipmentId }, select: { salesOrderId: true } });
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${shipmentRef.salesOrderId} FOR UPDATE`;

    const shipment = await tx.shipment.findUniqueOrThrow({
      where: { id: data.shipmentId },
      include: {
        items: true,
        receivables: { include: { payments: true } }
      }
    });

    if (shipment.status === "CANCELLED") throw new Error("La remisión ya está cancelada.");
    if (shipment.status !== "ISSUED") throw new Error("Sólo se pueden cancelar remisiones emitidas.");

    const blockingReceivable = shipment.receivables.find(receivable =>
      receivable.status !== "CANCELLED" || receivable.payments.length > 0
    );
    if (blockingReceivable) {
      throw new Error(`La remisión tiene la CxC ${blockingReceivable.folio} vigente o con cobros aplicados. Resuelve primero el documento financiero.`);
    }

    const order = await tx.salesOrder.findUniqueOrThrow({
      where: { id: shipment.salesOrderId },
      include: { items: true, productionOrders: true }
    });

    const cancellationNote = `[CANCELADA ${new Date().toISOString()}] ${data.reason}`;
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: "CANCELLED",
        notes: shipment.notes ? `${shipment.notes}\n${cancellationNote}` : cancellationNote
      }
    });

    const shipmentTotals = await tx.shipmentItem.groupBy({
      by: ["productId"],
      where: {
        shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } }
      },
      _sum: { quantity: true }
    });

    const shippedMap = new Map(shipmentTotals.map(row => [row.productId, Number(row._sum.quantity ?? 0)]));
    const allFulfilled = order.items.length > 0 && order.items.every(item =>
      (shippedMap.get(item.productId) ?? 0) + 0.000001 >= Number(item.quantity)
    );
    const anyShipped = shipmentTotals.some(row => Number(row._sum.quantity ?? 0) > 0);
    const productionComplete = order.productionOrders.length > 0 && order.productionOrders.every(op => op.status === "COMPLETED");

    const nextStatus = allFulfilled
      ? "SHIPPED"
      : anyShipped
        ? "PARTIALLY_SHIPPED"
        : productionComplete
          ? "READY"
          : order.productionOrders.length > 0
            ? "IN_PRODUCTION"
            : "CONFIRMED";

    await tx.salesOrder.update({ where: { id: order.id }, data: { status: nextStatus } });

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "SHIPMENT_CANCELLED",
      entityType: "Shipment",
      entityId: shipment.id,
      before: {
        shipmentStatus: shipment.status,
        salesOrderStatus: order.status,
        items: shipment.items.map(item => ({ productId: item.productId, lotId: item.lotId, quantity: item.quantity }))
      },
      after: {
        shipmentStatus: "CANCELLED",
        salesOrderStatus: nextStatus,
        reason: data.reason
      }
    });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/ventas");
}
