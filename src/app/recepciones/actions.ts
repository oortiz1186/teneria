"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  supplierName: z.string().min(2),
  animalType: z.string().min(2),
  hidesQuantity: z.coerce.number().int().positive(),
  weightKg: z.coerce.number().positive(),
  origin: z.string().optional()
});

function sequence(prefix: string) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}-${String(now.getTime()).slice(-8)}`;
}

export async function createReceipt(formData: FormData) {
  const data = schema.parse({
    supplierName: formData.get("supplierName"),
    animalType: formData.get("animalType"),
    hidesQuantity: formData.get("hidesQuantity"),
    weightKg: formData.get("weightKg"),
    origin: formData.get("origin")
  });

  const supplierCode = data.supplierName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .slice(0, 24);

  const supplier = await prisma.supplier.upsert({
    where: { code: supplierCode },
    update: { name: data.supplierName },
    create: { code: supplierCode, name: data.supplierName }
  });

  const receiptFolio = sequence("REC");
  const lotFolio = sequence("LOT");

  await prisma.$transaction(async tx => {
    const receipt = await tx.rawHideReceipt.create({
      data: {
        folio: receiptFolio,
        supplierId: supplier.id,
        receiptDate: new Date(),
        status: "CONFIRMED",
        origin: data.origin || null,
        totalHides: data.hidesQuantity,
        totalWeightKg: data.weightKg,
        items: {
          create: {
            animalType: data.animalType,
            hidesQuantity: data.hidesQuantity,
            weightKg: data.weightKg
          }
        }
      }
    });

    const lot = await tx.tanneryLot.create({
      data: {
        folio: lotFolio,
        receiptId: receipt.id,
        animalType: data.animalType,
        initialHides: data.hidesQuantity,
        currentHides: data.hidesQuantity,
        initialWeightKg: data.weightKg,
        currentWeightKg: data.weightKg,
        status: "RECEIVED",
        currentProcessCode: "RECEPTION"
      }
    });

    const warehouse = await tx.warehouse.findUnique({ where: { code: "MP" } });

    await tx.lotMovement.create({
      data: {
        lotId: lot.id,
        warehouseId: warehouse?.id,
        type: "RECEIPT",
        hidesQuantity: data.hidesQuantity,
        weightKg: data.weightKg,
        reference: receiptFolio
      }
    });
  });

  redirect("/lotes");
}
