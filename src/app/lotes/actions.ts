"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const splitSchema = z.object({
  lotId: z.string().min(1),
  hidesQuantity: z.coerce.number().int().positive(),
  weightKg: z.coerce.number().positive(),
  notes: z.string().optional()
});

const mergeSchema = z.object({
  sourceLotId: z.string().min(1),
  targetLotId: z.string().min(1),
  notes: z.string().optional()
});

const terminalStatuses = ["COMPLETED", "CANCELLED", "REJECTED", "CONSUMED"] as const;

function sameNullable(a?: string | null, b?: string | null) {
  return (a ?? null) === (b ?? null);
}

export async function splitLot(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const data = splitSchema.parse({
    lotId: formData.get("lotId"),
    hidesQuantity: formData.get("hidesQuantity"),
    weightKg: formData.get("weightKg"),
    notes: formData.get("notes") || undefined
  });

  const result = await prisma.$transaction(async tx => {
    const source = await tx.tanneryLot.findUniqueOrThrow({
      where: { id: data.lotId },
      include: { processes: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { routeStep: true } } }
    });
    if (terminalStatuses.includes(source.status as typeof terminalStatuses[number])) throw new Error("El lote no permite división en su estado actual.");
    if (source.processes.some(p => p.status === "IN_PROGRESS")) throw new Error("No se puede dividir un lote mientras tiene un proceso activo.");
    if (data.hidesQuantity >= source.currentHides) throw new Error("La división debe dejar al menos una piel en el lote original.");
    if (data.weightKg >= Number(source.currentWeightKg)) throw new Error("El peso dividido debe ser menor al peso actual del lote.");

    const child = await tx.tanneryLot.create({
      data: {
        folio: createFolio("LOT"),
        receiptId: source.receiptId,
        parentLotId: source.id,
        productionOrderId: source.productionOrderId,
        articleCode: source.articleCode,
        animalType: source.animalType,
        status: source.status,
        currentProcessCode: source.currentProcessCode,
        initialHides: data.hidesQuantity,
        currentHides: data.hidesQuantity,
        initialWeightKg: data.weightKg,
        currentWeightKg: data.weightKg,
        color: source.color,
        notes: data.notes
      }
    });

    const pending = source.processes.filter(p => p.status === "PENDING");
    if (pending.length > 0) {
      await tx.lotProcess.createMany({
        data: pending.map(p => ({
          lotId: child.id,
          processId: p.processId,
          routeStepId: p.routeStepId,
          productionOrderId: p.productionOrderId,
          status: "PENDING"
        }))
      });
    }

    const updatedSource = await tx.tanneryLot.update({
      where: { id: source.id },
      data: {
        currentHides: source.currentHides - data.hidesQuantity,
        currentWeightKg: Number(source.currentWeightKg) - data.weightKg
      }
    });

    await tx.lotRelation.create({ data: { parentLotId: source.id, childLotId: child.id, relationType: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: source.id, type: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, reference: child.folio, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: child.id, type: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, reference: source.folio, notes: "Creado por división" } });
    return { source, updatedSource, child, pendingCount: pending.length };
  });

  await writeAuditLog({
    actor,
    action: "LOT_SPLIT",
    entityType: "TanneryLot",
    entityId: result.source.id,
    before: { folio: result.source.folio, hides: result.source.currentHides, weightKg: result.source.currentWeightKg },
    after: { sourceHides: result.updatedSource.currentHides, sourceWeightKg: result.updatedSource.currentWeightKg, childId: result.child.id, childFolio: result.child.folio, childHides: result.child.currentHides, childWeightKg: result.child.currentWeightKg, clonedPendingSteps: result.pendingCount }
  });

  revalidatePath("/lotes");
  revalidatePath("/produccion");
  revalidatePath("/produccion/ordenes");
}

export async function mergeLots(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const data = mergeSchema.parse({ sourceLotId: formData.get("sourceLotId"), targetLotId: formData.get("targetLotId"), notes: formData.get("notes") || undefined });
  if (data.sourceLotId === data.targetLotId) throw new Error("Debes seleccionar dos lotes diferentes.");

  const result = await prisma.$transaction(async tx => {
    const [source, target] = await Promise.all([
      tx.tanneryLot.findUniqueOrThrow({ where: { id: data.sourceLotId }, include: { processes: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { routeStep: true } } } }),
      tx.tanneryLot.findUniqueOrThrow({ where: { id: data.targetLotId }, include: { processes: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, include: { routeStep: true } } } })
    ]);

    if (terminalStatuses.includes(source.status as typeof terminalStatuses[number]) || terminalStatuses.includes(target.status as typeof terminalStatuses[number])) throw new Error("No se pueden mezclar lotes en estado terminal.");
    if (source.processes.some(p => p.status === "IN_PROGRESS") || target.processes.some(p => p.status === "IN_PROGRESS")) throw new Error("No se pueden mezclar lotes mientras alguno tenga un proceso activo.");
    if (source.animalType !== target.animalType) throw new Error("No se pueden mezclar lotes de diferente tipo de piel.");
    if (!sameNullable(source.productionOrderId, target.productionOrderId)) throw new Error("Los lotes deben pertenecer a la misma orden de producción.");
    if (!sameNullable(source.currentProcessCode, target.currentProcessCode)) throw new Error("Los lotes deben estar en la misma etapa del proceso.");
    if (!sameNullable(source.articleCode, target.articleCode)) throw new Error("Los lotes deben corresponder al mismo artículo.");
    if (!sameNullable(source.color, target.color)) throw new Error("Los lotes deben tener el mismo color objetivo/actual.");

    const sourcePending = source.processes.filter(p => p.status === "PENDING").map(p => `${p.routeStep?.sequence ?? 999999}:${p.processId}`).sort();
    const targetPending = target.processes.filter(p => p.status === "PENDING").map(p => `${p.routeStep?.sequence ?? 999999}:${p.processId}`).sort();
    if (sourcePending.length !== targetPending.length || sourcePending.some((v, i) => v !== targetPending[i])) throw new Error("Los lotes no tienen la misma ruta pendiente y no pueden fusionarse con seguridad.");

    const updatedTarget = await tx.tanneryLot.update({
      where: { id: target.id },
      data: { currentHides: target.currentHides + source.currentHides, currentWeightKg: Number(target.currentWeightKg) + Number(source.currentWeightKg) }
    });
    const consumedSource = await tx.tanneryLot.update({ where: { id: source.id }, data: { status: "CONSUMED", currentHides: 0, currentWeightKg: 0, notes: `${source.notes ?? ""}\nFusionado en ${target.folio}`.trim() } });
    await tx.lotProcess.updateMany({ where: { lotId: source.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.lotRelation.create({ data: { parentLotId: source.id, childLotId: target.id, relationType: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: source.id, type: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, reference: target.folio, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: target.id, type: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, reference: source.folio, notes: data.notes } });

    return { source, target, consumedSource, updatedTarget };
  });

  await writeAuditLog({
    actor,
    action: "LOTS_MERGED",
    entityType: "TanneryLot",
    entityId: result.updatedTarget.id,
    before: { source: { id: result.source.id, folio: result.source.folio, hides: result.source.currentHides, weightKg: result.source.currentWeightKg, status: result.source.status }, target: { id: result.target.id, folio: result.target.folio, hides: result.target.currentHides, weightKg: result.target.currentWeightKg } },
    after: { sourceStatus: result.consumedSource.status, targetHides: result.updatedTarget.currentHides, targetWeightKg: result.updatedTarget.currentWeightKg }
  });

  revalidatePath("/lotes");
  revalidatePath("/produccion");
  revalidatePath("/produccion/ordenes");
}
