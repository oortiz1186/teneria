"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  supplierName: z.string().min(2),
  animalType: z.string().min(2),
  hidesQuantity: z.coerce.number().int().positive(),
  weightKg: z.coerce.number().positive(),
  origin: z.string().optional()
});

export async function createReceipt(formData: FormData) {
  const actor = await requireRole(["WAREHOUSE", "PURCHASING"]);
  const data = schema.parse({
    supplierName: formData.get("supplierName"),
    animalType: formData.get("animalType"),
    hidesQuantity: formData.get("hidesQuantity"),
    weightKg: formData.get("weightKg"),
    origin: formData.get("origin") || undefined
  });

  const supplierCodeBase = data.supplierName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "PROV";

  const existingSupplier = await prisma.supplier.findFirst({
    where: { name: { equals: data.supplierName.trim(), mode: "insensitive" } }
  });

  const supplier = existingSupplier ?? await prisma.supplier.create({
    data: { code: createFolio(supplierCodeBase).slice(0, 40), name: data.supplierName.trim() }
  });

  const receiptFolio = createFolio("REC");
  const lotFolio = createFolio("LOT");

  const result = await prisma.$transaction(async tx => {
    const receipt = await tx.rawHideReceipt.create({
      data: {
        folio: receiptFolio,
        supplierId: supplier.id,
        receiptDate: new Date(),
        status: "CONFIRMED",
        origin: data.origin?.trim() || null,
        totalHides: data.hidesQuantity,
        totalWeightKg: data.weightKg,
        items: {
          create: {
            animalType: data.animalType.trim(),
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
        animalType: data.animalType.trim(),
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

    return { receipt, lot };
  });

  await writeAuditLog({
    actor,
    action: "RAW_HIDE_RECEIPT_CREATED",
    entityType: "RawHideReceipt",
    entityId: result.receipt.id,
    after: {
      receiptFolio: result.receipt.folio,
      lotId: result.lot.id,
      lotFolio: result.lot.folio,
      supplierId: supplier.id,
      supplierName: supplier.name,
      animalType: data.animalType,
      hidesQuantity: data.hidesQuantity,
      weightKg: data.weightKg,
      origin: data.origin ?? null
    }
  });

  redirect("/lotes");
}
