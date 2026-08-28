"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

const schema = z.object({
  lotProcessId: z.string().min(1),
  chemicalLotId: z.string().min(1),
  actualQuantity: z.coerce.number().positive()
});

export async function registerConsumption(formData: FormData) {
  const actor = await requireRole(["PRODUCTION", "WAREHOUSE"]);
  const auditContext = await getAuditContext();
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

    const recipe = await tx.recipe.findFirst({
      where: {
        processId: execution.processId,
        active: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }]
      },
      orderBy: [{ version: "desc" }, { effectiveFrom: "desc" }],
      include: { items: true }
    });

    const item = recipe?.items.find(i => i.chemicalId === chemicalLot.chemicalId);
    let theoreticalQuantity: number | undefined;
    if (item) {
      if (item.basis === "WEIGHT_PERCENT") {
        if (!["kg", "g"].includes(chemicalLot.chemical.unit.toLowerCase())) {
          throw new Error("Una receta porcentual sobre peso sólo puede consumir químicos con unidad de masa (kg/g).");
        }
        theoreticalQuantity = Number(execution.inputWeightKg ?? 0) * (Number(item.quantity) / 100);
        if (chemicalLot.chemical.unit.toLowerCase() === "g") theoreticalQuantity *= 1000;
      } else {
        theoreticalQuantity = Number(item.quantity);
      }
    }

    const stockUpdate = await tx.chemicalLot.updateMany({
      where: { id: chemicalLot.id, currentQuantity: { gte: data.actualQuantity } },
      data: { currentQuantity: { decrement: data.actualQuantity } }
    });
    if (stockUpdate.count !== 1) throw new Error("Existencia insuficiente. Otro usuario pudo consumir este lote al mismo tiempo; actualiza la pantalla e intenta de nuevo.");

    const unitCost = chemicalLot.unitCost ? Number(chemicalLot.unitCost) : undefined;
    const totalCost = unitCost == null ? undefined : unitCost * data.actualQuantity;

    const consumption = await tx.processChemicalConsumption.create({
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

    const updatedLot = await tx.chemicalLot.findUniqueOrThrow({ where: { id: chemicalLot.id } });

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "CHEMICAL_CONSUMPTION_REGISTERED",
      entityType: "ChemicalLot",
      entityId: data.chemicalLotId,
      before: { currentQuantity: chemicalLot.currentQuantity },
      after: {
        currentQuantity: updatedLot.currentQuantity,
        actualQuantity: data.actualQuantity,
        consumptionId: consumption.id,
        lotProcessId: execution.id,
        processCode: execution.process.code,
        recipeId: recipe?.id ?? null
      }
    });
  });

  revalidatePath("/inventario");
  revalidatePath("/inventario/consumos");
  revalidatePath("/produccion");
}
