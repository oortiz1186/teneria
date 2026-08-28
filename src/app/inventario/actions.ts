"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const chemicalSchema = z.object({
  code: z.string().min(2), name: z.string().min(2), category: z.string().optional(), unit: z.string().min(1), minStock: z.coerce.number().nonnegative().optional()
});

export async function createChemical(formData: FormData) {
  const rawMin = formData.get("minStock");
  const data = chemicalSchema.parse({
    code: String(formData.get("code") || "").toUpperCase().trim(),
    name: formData.get("name"), category: formData.get("category") || undefined,
    unit: formData.get("unit"), minStock: rawMin === "" ? undefined : rawMin
  });
  await prisma.chemicalProduct.create({ data });
  revalidatePath("/inventario");
}

const receiptSchema = z.object({
  chemicalId: z.string().min(1), warehouseId: z.string().min(1), supplierId: z.string().optional(),
  lotNumber: z.string().min(1), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().nonnegative().optional(), expiresAt: z.string().optional()
});

export async function receiveChemical(formData: FormData) {
  const rawCost = formData.get("unitCost");
  const data = receiptSchema.parse({
    chemicalId: formData.get("chemicalId"), warehouseId: formData.get("warehouseId"), supplierId: formData.get("supplierId") || undefined,
    lotNumber: formData.get("lotNumber"), quantity: formData.get("quantity"), unitCost: rawCost === "" ? undefined : rawCost,
    expiresAt: formData.get("expiresAt") || undefined
  });

  await prisma.$transaction(async tx => {
    const lot = await tx.chemicalLot.create({
      data: {
        chemicalId: data.chemicalId, warehouseId: data.warehouseId, supplierId: data.supplierId,
        lotNumber: data.lotNumber, initialQuantity: data.quantity, currentQuantity: data.quantity,
        unitCost: data.unitCost, expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      }
    });
    await tx.chemicalStockMovement.create({
      data: {
        chemicalId: data.chemicalId, chemicalLotId: lot.id, warehouseId: data.warehouseId,
        type: "RECEIPT", quantity: data.quantity, unitCost: data.unitCost, reference: data.lotNumber
      }
    });
  });
  revalidatePath("/inventario");
}

const recipeSchema = z.object({ code: z.string().min(2), name: z.string().min(2), processId: z.string().min(1) });
export async function createRecipe(formData: FormData) {
  const data = recipeSchema.parse({ code: String(formData.get("code") || "").toUpperCase().trim(), name: formData.get("name"), processId: formData.get("processId") });
  await prisma.recipe.create({ data });
  revalidatePath("/inventario/recetas");
}

const itemSchema = z.object({ recipeId: z.string().min(1), chemicalId: z.string().min(1), sequence: z.coerce.number().int().positive(), basis: z.enum(["WEIGHT_PERCENT","FIXED_QUANTITY"]), quantity: z.coerce.number().positive(), tolerancePercent: z.coerce.number().nonnegative().optional() });
export async function addRecipeItem(formData: FormData) {
  const rawTol = formData.get("tolerancePercent");
  const data = itemSchema.parse({ recipeId: formData.get("recipeId"), chemicalId: formData.get("chemicalId"), sequence: formData.get("sequence"), basis: formData.get("basis"), quantity: formData.get("quantity"), tolerancePercent: rawTol === "" ? undefined : rawTol });
  await prisma.recipeItem.create({ data });
  revalidatePath("/inventario/recetas");
}
