"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  lotProcessId: z.string().min(1),
  chemicalLotId: z.string().min(1),
  actualQuantity: z.coerce.number().positive()
});

export async function registerConsumption(formData: FormData) {
  const data = schema.parse({
    lotProcessId: formData.get("lotProcessId"),
    chemicalLotId: formData.get("chemicalLotId"),
    actualQuantity: formData.get("actualQuantity")
  });

  await prisma.$transaction(async tx => {
    const execution = await tx.lotProcess.findUniqueOrThrow({
      where: { id: data.lotProcessId },
      include: { process: true }
    });
    if (execution.status !== "IN_PROGRESS") throw new Error("El proceso debe estar activo para registrar consumo.");

    const chemicalLot = await tx.chemicalLot.findUniqueOrThrow({
      where: { id: data.chemicalLotId },
      include: { chemical: true }
    });
    if (Number(chemicalLot.currentQuantity) < data.actualQuantity) throw new Error("Existencia insuficiente del lote químico seleccionado.");

    const recipe = await tx.recipe.findFirst({
      where: { processId: execution.processId, active: true },
      orderBy: [{ version: "desc" }, { effectiveFrom: "desc" }],
      include: { items: true }
    });

    const item = recipe?.items.find(i => i.chemicalId === chemicalLot.chemicalId);
    let theoreticalQuantity: number | undefined;
    if (item) {
      if (item.basis === "WEIGHT_PERCENT") {
        theoreticalQuantity = Number(execution.inputWeightKg ?? 0) * (Number(item.quantity) / 100);
      } else {
        theoreticalQuantity = Number(item.quantity);
      }
    }

    const unitCost = chemicalLot.unitCost ? Number(chemicalLot.unitCost) : undefined;
    const totalCost = unitCost == null ? undefined : unitCost * data.actualQuantity;

    await tx.processChemicalConsumption.create({
      data: {
        lotProcessId: execution.id,
        chemicalId: chemicalLot.chemicalId,
        chemicalLotId: chemicalLot.id,
        theoreticalQuantity,
        actualQuantity: data.actualQuantity,
        unitCost,
        totalCost
      }
    });

    await tx.chemicalLot.update({
      where: { id: chemicalLot.id },
      data: { currentQuantity: { decrement: data.actualQuantity } }
    });

    await tx.chemicalStockMovement.create({
      data: {
        chemicalId: chemicalLot.chemicalId,
        chemicalLotId: chemicalLot.id,
        warehouseId: chemicalLot.warehouseId,
        type: "CONSUMPTION",
        quantity: data.actualQuantity,
        unitCost,
        reference: `${execution.lotId}:${execution.process.code}`
      }
    });
  });

  revalidatePath("/inventario");
  revalidatePath("/inventario/consumos");
  revalidatePath("/produccion");
}
