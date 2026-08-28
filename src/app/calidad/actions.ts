"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createFolio } from "@/lib/folio";

const inspectionSchema = z.object({
  lotId: z.string().min(1),
  lotProcessId: z.string().optional(),
  grade: z.string().optional(),
  thicknessMm: z.coerce.number().nonnegative().optional(),
  areaDm2: z.coerce.number().nonnegative().optional(),
  colorResult: z.string().optional(),
  visualResult: z.string().optional(),
  tensileResult: z.string().optional(),
  adhesionResult: z.string().optional(),
  flexResult: z.string().optional(),
  inspectorName: z.string().optional(),
  notes: z.string().optional()
});

export async function createInspection(formData: FormData) {
  await requireRole(["QUALITY"]);
  const data = inspectionSchema.parse({
    lotId: formData.get("lotId"),
    lotProcessId: formData.get("lotProcessId") || undefined,
    grade: formData.get("grade") || undefined,
    thicknessMm: formData.get("thicknessMm") || undefined,
    areaDm2: formData.get("areaDm2") || undefined,
    colorResult: formData.get("colorResult") || undefined,
    visualResult: formData.get("visualResult") || undefined,
    tensileResult: formData.get("tensileResult") || undefined,
    adhesionResult: formData.get("adhesionResult") || undefined,
    flexResult: formData.get("flexResult") || undefined,
    inspectorName: formData.get("inspectorName") || undefined,
    notes: formData.get("notes") || undefined
  });

  const lot = await prisma.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });
  if (["REJECTED", "CANCELLED"].includes(lot.status)) throw new Error("El lote está cerrado para inspección.");

  let processId: string | undefined;
  if (data.lotProcessId) {
    const lp = await prisma.lotProcess.findUniqueOrThrow({ where: { id: data.lotProcessId } });
    if (lp.lotId !== data.lotId) throw new Error("El proceso seleccionado no pertenece al lote.");
    processId = lp.processId;
  }

  await prisma.qualityInspection.create({
    data: {
      folio: createFolio("QC"),
      lotId: data.lotId,
      lotProcessId: data.lotProcessId,
      processId,
      grade: data.grade,
      thicknessMm: data.thicknessMm,
      areaDm2: data.areaDm2,
      colorResult: data.colorResult,
      visualResult: data.visualResult,
      tensileResult: data.tensileResult,
      adhesionResult: data.adhesionResult,
      flexResult: data.flexResult,
      inspectorName: data.inspectorName,
      notes: data.notes,
      status: "DRAFT"
    }
  });

  revalidatePath("/calidad");
}

export async function addDefect(formData: FormData) {
  await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const defectId = z.string().min(1).parse(formData.get("defectId"));
  const severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).parse(formData.get("severity"));
  const affectedHidesRaw = formData.get("affectedHides");
  const affectedAreaRaw = formData.get("affectedAreaDm2");

  const inspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { lot: true } });
  if (inspection.status !== "DRAFT") throw new Error("La inspección ya fue resuelta.");
  const affectedHides = affectedHidesRaw ? Number(affectedHidesRaw) : null;
  if (affectedHides !== null && affectedHides > inspection.lot.currentHides) throw new Error("Las pieles afectadas exceden el total del lote.");

  await prisma.qualityDefectFinding.create({
    data: {
      inspectionId,
      defectId,
      severity,
      affectedHides,
      affectedAreaDm2: affectedAreaRaw ? Number(affectedAreaRaw) : null,
      notes: String(formData.get("notes") || "") || null
    }
  });

  revalidatePath("/calidad");
}

export async function addEvidence(formData: FormData) {
  await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const fileUrl = z.string().url().parse(formData.get("fileUrl"));
  const fileName = String(formData.get("fileName") || "") || null;
  const notes = String(formData.get("notes") || "") || null;
  const inspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId } });
  if (inspection.status !== "DRAFT") throw new Error("La inspección ya fue resuelta.");

  await prisma.qualityEvidence.create({ data: { inspectionId, fileUrl, fileName, notes } });
  revalidatePath("/calidad");
}

export async function resolveInspection(formData: FormData) {
  await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const disposition = z.enum(["RELEASE", "REWORK", "REJECT", "HOLD"]).parse(formData.get("disposition"));

  await prisma.$transaction(async tx => {
    const inspection = await tx.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { lot: true } });
    if (inspection.status !== "DRAFT") throw new Error("La inspección ya fue resuelta.");

    const status = disposition === "RELEASE" ? "APPROVED" : disposition === "REWORK" ? "REWORK_REQUIRED" : disposition === "REJECT" ? "REJECTED" : "CONDITIONAL";

    await tx.qualityInspection.update({
      where: { id: inspectionId },
      data: { status, disposition, releasedAt: disposition === "RELEASE" ? new Date() : null }
    });

    if (disposition === "RELEASE") {
      await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "COMPLETED", currentProcessCode: "QUALITY" } });
      const finishedWarehouse = await tx.warehouse.findUnique({ where: { code: "PT" } });
      await tx.lotMovement.create({ data: { lotId: inspection.lotId, warehouseId: finishedWarehouse?.id, type: "FINISHED_GOODS", hidesQuantity: inspection.lot.currentHides, weightKg: inspection.lot.currentWeightKg, reference: inspection.folio, notes: "Lote liberado por calidad" } });

      if (inspection.lot.productionOrderId) {
        const unfinishedLots = await tx.tanneryLot.count({ where: { productionOrderId: inspection.lot.productionOrderId, status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] } } });
        if (unfinishedLots === 0) await tx.productionOrder.update({ where: { id: inspection.lot.productionOrderId }, data: { status: "COMPLETED" } });
      }
    } else if (disposition === "HOLD") {
      await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "ON_HOLD" } });
    } else if (disposition === "REJECT") {
      await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "REJECTED" } });
      await tx.lotMovement.create({ data: { lotId: inspection.lotId, type: "REJECTION", hidesQuantity: inspection.lot.currentHides, weightKg: inspection.lot.currentWeightKg, reference: inspection.folio, notes: "Rechazo por inspección de calidad" } });
    } else {
      await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "ON_HOLD", currentProcessCode: "REWORK" } });
    }
  });

  revalidatePath("/calidad");
  revalidatePath("/lotes");
  revalidatePath("/produccion");
  revalidatePath("/produccion/ordenes");
  revalidatePath("/");
}
