"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const chemicalSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  category: z.string().optional(),
  unit: z.string().min(1),
  minStock: z.coerce.number().nonnegative().optional()
});

export async function createChemical(formData: FormData) {
  const actor = await requireRole(["WAREHOUSE", "PURCHASING"]);
  const rawMin = formData.get("minStock");
  const data = chemicalSchema.parse({
    code: String(formData.get("code") || "").toUpperCase().trim(),
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    unit: String(formData.get("unit") || "").trim(),
    minStock: rawMin === "" ? undefined : rawMin
  });
  const chemical = await prisma.chemicalProduct.create({ data });
  await writeAuditLog({ actor, action: "CHEMICAL_CREATED", entityType: "ChemicalProduct", entityId: chemical.id, after: chemical });
  revalidatePath("/inventario");
}

const receiptSchema = z.object({
  chemicalId: z.string().min(1),
  warehouseId: z.string().min(1),
  supplierId: z.string().optional(),
  lotNumber: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  expiresAt: z.string().optional()
});

export async function receiveChemical(formData: FormData) {
  const actor = await requireRole(["WAREHOUSE", "PURCHASING"]);
  const rawCost = formData.get("unitCost");
  const data = receiptSchema.parse({
    chemicalId: formData.get("chemicalId"),
    warehouseId: formData.get("warehouseId"),
    supplierId: formData.get("supplierId") || undefined,
    lotNumber: String(formData.get("lotNumber") || "").trim(),
    quantity: formData.get("quantity"),
    unitCost: rawCost === "" ? undefined : rawCost,
    expiresAt: formData.get("expiresAt") || undefined
  });

  const result = await prisma.$transaction(async tx => {
    const chemical = await tx.chemicalProduct.findUniqueOrThrow({ where: { id: data.chemicalId } });
    const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: data.warehouseId } });
    if (warehouse.code !== "QUI") throw new Error("La recepción manual de químicos sólo puede ingresarse al almacén de químicos.");

    if (data.supplierId) await tx.supplier.findUniqueOrThrow({ where: { id: data.supplierId } });

    const lot = await tx.chemicalLot.upsert({
      where: { chemicalId_warehouseId_lotNumber: { chemicalId: data.chemicalId, warehouseId: data.warehouseId, lotNumber: data.lotNumber } },
      update: {
        currentQuantity: { increment: data.quantity },
        initialQuantity: { increment: data.quantity },
        supplierId: data.supplierId,
        unitCost: data.unitCost,
        expiresAt: data.expiresAt ? new Date(`${data.expiresAt}T12:00:00`) : undefined
      },
      create: {
        chemicalId: data.chemicalId,
        warehouseId: data.warehouseId,
        supplierId: data.supplierId,
        lotNumber: data.lotNumber,
        initialQuantity: data.quantity,
        currentQuantity: data.quantity,
        unitCost: data.unitCost,
        expiresAt: data.expiresAt ? new Date(`${data.expiresAt}T12:00:00`) : undefined
      }
    });

    const movement = await tx.chemicalStockMovement.create({
      data: {
        chemicalId: data.chemicalId,
        chemicalLotId: lot.id,
        warehouseId: data.warehouseId,
        type: "RECEIPT",
        quantity: data.quantity,
        unitCost: data.unitCost,
        reference: data.lotNumber
      }
    });
    return { chemical, warehouse, lot, movement };
  });

  await writeAuditLog({
    actor,
    action: "CHEMICAL_RECEIVED",
    entityType: "ChemicalStockMovement",
    entityId: result.movement.id,
    after: {
      chemicalId: result.chemical.id,
      chemicalCode: result.chemical.code,
      chemicalLotId: result.lot.id,
      lotNumber: result.lot.lotNumber,
      warehouseId: result.warehouse.id,
      warehouseCode: result.warehouse.code,
      quantity: data.quantity,
      unit: result.chemical.unit,
      unitCost: data.unitCost ?? null,
      currentQuantity: result.lot.currentQuantity
    }
  });
  revalidatePath("/inventario");
}

const recipeSchema = z.object({ code: z.string().min(2), name: z.string().min(2), processId: z.string().min(1) });
export async function createRecipe(formData: FormData) {
  const actor = await requireRole(["PRODUCTION", "WAREHOUSE"]);
  const data = recipeSchema.parse({
    code: String(formData.get("code") || "").toUpperCase().trim(),
    name: formData.get("name"),
    processId: formData.get("processId")
  });
  await prisma.processCatalog.findUniqueOrThrow({ where: { id: data.processId } });
  const recipe = await prisma.recipe.create({ data });
  await writeAuditLog({ actor, action: "RECIPE_CREATED", entityType: "Recipe", entityId: recipe.id, after: recipe });
  revalidatePath("/inventario/recetas");
}

const itemSchema = z.object({
  recipeId: z.string().min(1),
  chemicalId: z.string().min(1),
  sequence: z.coerce.number().int().positive(),
  basis: z.enum(["WEIGHT_PERCENT", "FIXED_QUANTITY"]),
  quantity: z.coerce.number().positive(),
  tolerancePercent: z.coerce.number().nonnegative().optional()
});

export async function addRecipeItem(formData: FormData) {
  const actor = await requireRole(["PRODUCTION", "WAREHOUSE"]);
  const rawTol = formData.get("tolerancePercent");
  const data = itemSchema.parse({
    recipeId: formData.get("recipeId"),
    chemicalId: formData.get("chemicalId"),
    sequence: formData.get("sequence"),
    basis: formData.get("basis"),
    quantity: formData.get("quantity"),
    tolerancePercent: rawTol === "" ? undefined : rawTol
  });
  const [recipe, chemical] = await Promise.all([
    prisma.recipe.findUniqueOrThrow({ where: { id: data.recipeId } }),
    prisma.chemicalProduct.findUniqueOrThrow({ where: { id: data.chemicalId } })
  ]);
  const item = await prisma.recipeItem.create({ data });
  await writeAuditLog({ actor, action: "RECIPE_ITEM_ADDED", entityType: "RecipeItem", entityId: item.id, after: { ...data, recipeCode: recipe.code, chemicalCode: chemical.code } });
  revalidatePath("/inventario/recetas");
}
