"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const costEntrySchema = z.object({
  lotId: z.string().min(1),
  lotProcessId: z.string().optional(),
  category: z.enum(["LABOR","WATER","ENERGY","MACHINE","REWORK","OVERHEAD","OTHER"]),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitCost: z.coerce.number().nonnegative(),
  notes: z.string().optional()
});

export async function createLotCostEntry(formData: FormData) {
  const data = costEntrySchema.parse({
    lotId: formData.get("lotId"),
    lotProcessId: formData.get("lotProcessId") || undefined,
    category: formData.get("category"),
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    unitCost: formData.get("unitCost"),
    notes: formData.get("notes") || undefined
  });

  await prisma.lotCostEntry.create({
    data: {
      ...data,
      lotProcessId: data.lotProcessId || null,
      totalCost: data.quantity * data.unitCost
    }
  });

  await calculateLotCostById(data.lotId);
  revalidatePath("/costos");
}

async function calculateLotCostById(lotId: string) {
  const lot = await prisma.tanneryLot.findUniqueOrThrow({
    where: { id: lotId },
    include: {
      receipt: { include: { items: true } },
      processes: { include: { chemicalConsumptions: true } },
      costEntries: true,
      qualityInspections: { orderBy: { inspectedAt: "desc" }, take: 1 }
    }
  });

  let rawHideCost = 0;
  if (lot.receipt && Number(lot.receipt.totalWeightKg) > 0) {
    const receiptRawCost = lot.receipt.items.reduce((sum, item) => {
      return sum + Number(item.weightKg) * Number(item.unitCost ?? 0);
    }, 0);
    rawHideCost = receiptRawCost * (Number(lot.initialWeightKg) / Number(lot.receipt.totalWeightKg));
  }

  const chemicalCost = lot.processes.reduce((processSum, process) => {
    return processSum + process.chemicalConsumptions.reduce((sum, c) => sum + Number(c.totalCost ?? 0), 0);
  }, 0);

  const categoryTotals = new Map<string, number>();
  for (const entry of lot.costEntries) {
    categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + Number(entry.totalCost));
  }

  const laborCost = categoryTotals.get("LABOR") ?? 0;
  const waterCost = categoryTotals.get("WATER") ?? 0;
  const energyCost = categoryTotals.get("ENERGY") ?? 0;
  const machineCost = categoryTotals.get("MACHINE") ?? 0;
  const reworkCost = categoryTotals.get("REWORK") ?? 0;
  const overheadCost = categoryTotals.get("OVERHEAD") ?? 0;
  const otherCost = categoryTotals.get("OTHER") ?? 0;
  const totalCost = rawHideCost + chemicalCost + laborCost + waterCost + energyCost + machineCost + reworkCost + overheadCost + otherCost;

  const outputHides = lot.currentHides || null;
  const outputWeightKg = Number(lot.currentWeightKg) || null;
  const outputAreaDm2 = lot.qualityInspections[0]?.areaDm2 ? Number(lot.qualityInspections[0].areaDm2) : null;

  await prisma.lotCostSnapshot.upsert({
    where: { lotId: lot.id },
    update: {
      rawHideCost, chemicalCost, laborCost, waterCost, energyCost, machineCost,
      reworkCost, overheadCost, otherCost, totalCost,
      outputHides, outputWeightKg, outputAreaDm2,
      costPerHide: outputHides && outputHides > 0 ? totalCost / outputHides : null,
      costPerKg: outputWeightKg && outputWeightKg > 0 ? totalCost / outputWeightKg : null,
      costPerDm2: outputAreaDm2 && outputAreaDm2 > 0 ? totalCost / outputAreaDm2 : null,
      calculatedAt: new Date()
    },
    create: {
      lotId: lot.id, rawHideCost, chemicalCost, laborCost, waterCost, energyCost, machineCost,
      reworkCost, overheadCost, otherCost, totalCost,
      outputHides, outputWeightKg, outputAreaDm2,
      costPerHide: outputHides && outputHides > 0 ? totalCost / outputHides : null,
      costPerKg: outputWeightKg && outputWeightKg > 0 ? totalCost / outputWeightKg : null,
      costPerDm2: outputAreaDm2 && outputAreaDm2 > 0 ? totalCost / outputAreaDm2 : null
    }
  });
}

export async function recalculateLotCost(formData: FormData) {
  const lotId = z.string().min(1).parse(formData.get("lotId"));
  await calculateLotCostById(lotId);
  revalidatePath("/costos");
}

export async function recalculateAllLotCosts() {
  const lots = await prisma.tanneryLot.findMany({ select: { id: true } });
  for (const lot of lots) await calculateLotCostById(lot.id);
  revalidatePath("/costos");
}

export async function queueAccountingSync(formData: FormData) {
  const entityType = z.enum(["SUPPLIER_INVOICE","RECEIVABLE","PAYMENT","EXPENSE","SALES_ORDER","PURCHASE_ORDER"]).parse(formData.get("entityType"));
  const entityId = z.string().min(1).parse(formData.get("entityId"));

  const existing = await prisma.accountingSyncQueue.findFirst({
    where: { entityType, entityId, status: { in: ["PENDING","PROCESSING"] } }
  });
  if (!existing) {
    await prisma.accountingSyncQueue.create({ data: { entityType, entityId } });
  }
  revalidatePath("/costos");
  revalidatePath("/finanzas");
}
