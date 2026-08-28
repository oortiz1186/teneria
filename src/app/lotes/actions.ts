"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

function folio(prefix: string) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}-${String(now.getTime()).slice(-8)}`;
}

export async function splitLot(formData: FormData) {
  const data = splitSchema.parse({
    lotId: formData.get("lotId"),
    hidesQuantity: formData.get("hidesQuantity"),
    weightKg: formData.get("weightKg"),
    notes: formData.get("notes") || undefined
  });

  await prisma.$transaction(async tx => {
    const source = await tx.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });
    if (source.status === "COMPLETED" || source.status === "CANCELLED" || source.status === "REJECTED") throw new Error("El lote no permite división en su estado actual.");
    if (data.hidesQuantity >= source.currentHides) throw new Error("La división debe dejar al menos una piel en el lote original.");
    if (data.weightKg >= Number(source.currentWeightKg)) throw new Error("El peso dividido debe ser menor al peso actual del lote.");

    const child = await tx.tanneryLot.create({
      data: {
        folio: folio("LOT"),
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

    await tx.tanneryLot.update({
      where: { id: source.id },
      data: {
        currentHides: source.currentHides - data.hidesQuantity,
        currentWeightKg: Number(source.currentWeightKg) - data.weightKg
      }
    });

    await tx.lotRelation.create({ data: { parentLotId: source.id, childLotId: child.id, relationType: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: source.id, type: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, reference: child.folio, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: child.id, type: "SPLIT", hidesQuantity: data.hidesQuantity, weightKg: data.weightKg, reference: source.folio, notes: "Creado por división" } });
  });

  revalidatePath("/lotes");
  revalidatePath("/produccion");
}

export async function mergeLots(formData: FormData) {
  const data = mergeSchema.parse({ sourceLotId: formData.get("sourceLotId"), targetLotId: formData.get("targetLotId"), notes: formData.get("notes") || undefined });
  if (data.sourceLotId === data.targetLotId) throw new Error("Debes seleccionar dos lotes diferentes.");

  await prisma.$transaction(async tx => {
    const [source, target] = await Promise.all([
      tx.tanneryLot.findUniqueOrThrow({ where: { id: data.sourceLotId } }),
      tx.tanneryLot.findUniqueOrThrow({ where: { id: data.targetLotId } })
    ]);

    if (source.animalType !== target.animalType) throw new Error("No se pueden mezclar lotes de diferente tipo de piel.");
    if (source.status === "COMPLETED" || target.status === "COMPLETED") throw new Error("No se pueden mezclar lotes completados.");

    await tx.tanneryLot.update({
      where: { id: target.id },
      data: { currentHides: target.currentHides + source.currentHides, currentWeightKg: Number(target.currentWeightKg) + Number(source.currentWeightKg) }
    });
    await tx.tanneryLot.update({ where: { id: source.id }, data: { status: "CANCELLED", currentHides: 0, currentWeightKg: 0, notes: `${source.notes ?? ""}\nFusionado en ${target.folio}`.trim() } });
    await tx.lotRelation.create({ data: { parentLotId: source.id, childLotId: target.id, relationType: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: source.id, type: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, reference: target.folio, notes: data.notes } });
    await tx.lotMovement.create({ data: { lotId: target.id, type: "MERGE", hidesQuantity: source.currentHides, weightKg: source.currentWeightKg, reference: source.folio, notes: data.notes } });
  });

  revalidatePath("/lotes");
  revalidatePath("/produccion");
}
