"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const createOrderSchema = z.object({
  customerName: z.string().optional(),
  articleCode: z.string().min(1),
  targetColor: z.string().optional(),
  requestedHides: z.coerce.number().int().positive().optional(),
  requestedWeightKg: z.coerce.number().positive().optional(),
  routeId: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional()
});

const assignLotSchema = z.object({
  orderId: z.string().min(1),
  lotId: z.string().min(1)
});

export async function createProductionOrder(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const rawHides = formData.get("requestedHides");
  const rawWeight = formData.get("requestedWeightKg");
  const data = createOrderSchema.parse({
    customerName: formData.get("customerName") || undefined,
    articleCode: formData.get("articleCode"),
    targetColor: formData.get("targetColor") || undefined,
    requestedHides: rawHides === "" ? undefined : rawHides,
    requestedWeightKg: rawWeight === "" ? undefined : rawWeight,
    routeId: formData.get("routeId") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    notes: formData.get("notes") || undefined
  });

  if (data.routeId) await prisma.productionRoute.findUniqueOrThrow({ where: { id: data.routeId } });

  let customerId: string | undefined;
  if (data.customerName?.trim()) {
    const name = data.customerName.trim();
    const existing = await prisma.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const customer = existing ?? await prisma.customer.create({ data: { code: createFolio("CLI"), name } });
    customerId = customer.id;
  }

  const order = await prisma.productionOrder.create({
    data: {
      folio: createFolio("OP"),
      customerId,
      articleCode: data.articleCode.trim(),
      targetColor: data.targetColor?.trim() || null,
      requestedHides: data.requestedHides,
      requestedWeightKg: data.requestedWeightKg,
      routeId: data.routeId,
      dueDate: data.dueDate ? new Date(`${data.dueDate}T12:00:00`) : undefined,
      notes: data.notes,
      status: "RELEASED"
    }
  });

  await writeAuditLog({
    actor,
    action: "PRODUCTION_ORDER_CREATED",
    entityType: "ProductionOrder",
    entityId: order.id,
    after: {
      folio: order.folio,
      customerId: order.customerId,
      articleCode: order.articleCode,
      targetColor: order.targetColor,
      requestedHides: order.requestedHides,
      requestedWeightKg: order.requestedWeightKg,
      routeId: order.routeId,
      dueDate: order.dueDate,
      status: order.status
    }
  });

  revalidatePath("/produccion/ordenes");
  redirect(`/produccion/ordenes/${order.id}`);
}

export async function assignLotToOrder(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const data = assignLotSchema.parse({ orderId: formData.get("orderId"), lotId: formData.get("lotId") });

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "TanneryLot" WHERE id = ${data.lotId} FOR UPDATE`;
    const order = await tx.productionOrder.findUniqueOrThrow({
      where: { id: data.orderId },
      include: { route: { include: { steps: { include: { process: true }, orderBy: { sequence: "asc" } } } } }
    });
    if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new Error("La orden ya está cerrada y no admite lotes.");

    const lot = await tx.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });
    if (["COMPLETED", "REJECTED", "CANCELLED", "CONSUMED"].includes(lot.status)) throw new Error("El lote está cerrado y no puede asignarse a una orden.");
    const activeProcess = await tx.lotProcess.findFirst({ where: { lotId: lot.id, status: "IN_PROGRESS" } });
    if (activeProcess) throw new Error("No se puede reasignar un lote mientras tenga un proceso activo.");
    if (lot.productionOrderId && lot.productionOrderId !== order.id) throw new Error("El lote ya está asignado a otra orden de producción.");

    const updatedLot = await tx.tanneryLot.update({
      where: { id: lot.id },
      data: {
        productionOrderId: order.id,
        articleCode: order.articleCode ?? lot.articleCode,
        color: order.targetColor ?? lot.color
      }
    });

    if (order.route) {
      const existing = await tx.lotProcess.count({ where: { lotId: lot.id, productionOrderId: order.id } });
      if (existing === 0) {
        await tx.lotProcess.createMany({
          data: order.route.steps.map(step => ({
            lotId: lot.id,
            processId: step.processId,
            routeStepId: step.id,
            productionOrderId: order.id,
            status: "PENDING" as const
          }))
        });
      }
    }

    const updatedOrder = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
    return { beforeLot: lot, afterLot: updatedLot, order: updatedOrder };
  });

  await writeAuditLog({
    actor,
    action: "LOT_ASSIGNED_TO_PRODUCTION_ORDER",
    entityType: "TanneryLot",
    entityId: data.lotId,
    before: { productionOrderId: result.beforeLot.productionOrderId, articleCode: result.beforeLot.articleCode, color: result.beforeLot.color },
    after: { productionOrderId: result.order.id, productionOrderFolio: result.order.folio, articleCode: result.afterLot.articleCode, color: result.afterLot.color }
  });

  revalidatePath(`/produccion/ordenes/${data.orderId}`);
  revalidatePath("/produccion");
  revalidatePath("/lotes");
}
