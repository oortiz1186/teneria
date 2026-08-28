"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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

function folio(prefix: string) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}-${String(now.getTime()).slice(-8)}`;
}

export async function createProductionOrder(formData: FormData) {
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

  let customerId: string | undefined;
  if (data.customerName?.trim()) {
    const code = data.customerName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24);
    const customer = await prisma.customer.upsert({
      where: { code },
      update: { name: data.customerName.trim() },
      create: { code, name: data.customerName.trim() }
    });
    customerId = customer.id;
  }

  const order = await prisma.productionOrder.create({
    data: {
      folio: folio("OP"),
      customerId,
      articleCode: data.articleCode,
      targetColor: data.targetColor,
      requestedHides: data.requestedHides,
      requestedWeightKg: data.requestedWeightKg,
      routeId: data.routeId,
      dueDate: data.dueDate ? new Date(`${data.dueDate}T12:00:00`) : undefined,
      notes: data.notes,
      status: "RELEASED"
    }
  });

  revalidatePath("/produccion/ordenes");
  redirect(`/produccion/ordenes/${order.id}`);
}

export async function assignLotToOrder(formData: FormData) {
  const data = assignLotSchema.parse({ orderId: formData.get("orderId"), lotId: formData.get("lotId") });

  await prisma.$transaction(async tx => {
    const order = await tx.productionOrder.findUniqueOrThrow({
      where: { id: data.orderId },
      include: { route: { include: { steps: { include: { process: true }, orderBy: { sequence: "asc" } } } } }
    });
    const lot = await tx.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });

    if (lot.productionOrderId && lot.productionOrderId !== order.id) {
      throw new Error("El lote ya está asignado a otra orden de producción.");
    }

    await tx.tanneryLot.update({
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
        for (const step of order.route.steps) {
          await tx.lotProcess.create({
            data: {
              lotId: lot.id,
              processId: step.processId,
              routeStepId: step.id,
              productionOrderId: order.id,
              status: "PENDING"
            }
          });
        }
      }
    }

    await tx.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
  });

  revalidatePath(`/produccion/ordenes/${data.orderId}`);
  revalidatePath("/produccion");
  revalidatePath("/lotes");
}
