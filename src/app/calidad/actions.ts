"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFolio } from "@/lib/folio";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

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
  const actor = await requireRole(["QUALITY"]);
  const raw = {
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
  };
  const data = inspectionSchema.parse(raw);

  let processId: string | undefined;
  if (data.lotProcessId) {
    const lp = await prisma.lotProcess.findUnique({ where: { id: data.lotProcessId } });
    if (!lp || lp.lotId !== data.lotId) throw new Error("El proceso seleccionado no pertenece al lote.");
    processId = lp.processId;
  }

  const inspection = await prisma.qualityInspection.create({
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

  await writeAuditLog({ actor, action: "QUALITY_INSPECTION_CREATED", entityType: "QualityInspection", entityId: inspection.id, after: { folio: inspection.folio, lotId: inspection.lotId, lotProcessId: inspection.lotProcessId, grade: inspection.grade, thicknessMm: inspection.thicknessMm, areaDm2: inspection.areaDm2, inspectorName: inspection.inspectorName } });
  revalidatePath("/calidad");
}

export async function addDefect(formData: FormData) {
  const actor = await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const defectId = z.string().min(1).parse(formData.get("defectId"));
  const severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).parse(formData.get("severity"));
  const affectedHidesRaw = formData.get("affectedHides");
  const affectedAreaRaw = formData.get("affectedAreaDm2");
  const inspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId } });
  if (inspection.status !== "DRAFT") throw new Error("No se pueden agregar defectos a una inspección resuelta.");

  const finding = await prisma.qualityDefectFinding.create({
    data: {
      inspectionId,
      defectId,
      severity,
      affectedHides: affectedHidesRaw ? Number(affectedHidesRaw) : null,
      affectedAreaDm2: affectedAreaRaw ? Number(affectedAreaRaw) : null,
      notes: String(formData.get("notes") || "") || null
    }
  });

  await writeAuditLog({ actor, action: "QUALITY_DEFECT_ADDED", entityType: "QualityDefectFinding", entityId: finding.id, after: { inspectionId, defectId, severity, affectedHides: finding.affectedHides, affectedAreaDm2: finding.affectedAreaDm2 } });
  revalidatePath("/calidad");
}

export async function addEvidence(formData: FormData) {
  const actor = await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const fileUrl = z.string().url().parse(formData.get("fileUrl"));
  const fileName = String(formData.get("fileName") || "") || null;
  const notes = String(formData.get("notes") || "") || null;
  const inspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId } });
  if (inspection.status !== "DRAFT") throw new Error("No se puede agregar evidencia a una inspección resuelta.");

  const evidence = await prisma.qualityEvidence.create({ data: { inspectionId, fileUrl, fileName, notes } });
  await writeAuditLog({ actor, action: "QUALITY_EVIDENCE_ADDED", entityType: "QualityEvidence", entityId: evidence.id, after: { inspectionId, fileUrl, fileName } });
  revalidatePath("/calidad");
}

export async function resolveInspection(formData: FormData) {
  const actor = await requireRole(["QUALITY"]);
  const inspectionId = z.string().min(1).parse(formData.get("inspectionId"));
  const disposition = z.enum(["RELEASE", "REWORK", "REJECT", "HOLD"]).parse(formData.get("disposition"));

  const result = await prisma.$transaction(async tx => {
    const inspection = await tx.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { lot: true } });
    if (inspection.status !== "DRAFT") throw new Error("La inspección ya fue resuelta.");

    const status = disposition === "RELEASE" ? "APPROVED" : disposition === "REWORK" ? "REWORK_REQUIRED" : disposition === "REJECT" ? "REJECTED" : "CONDITIONAL";

    const updatedInspection = await tx.qualityInspection.update({
      where: { id: inspectionId },
      data: { status, disposition, releasedAt: disposition === "RELEASE" ? new Date() : null }
    });

    let lotStatus = inspection.lot.status;
    if (disposition === "RELEASE") {
      const lot = await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "COMPLETED", currentProcessCode: "QUALITY" } });
      lotStatus = lot.status;
      const finishedWarehouse = await tx.warehouse.findUnique({ where: { code: "PT" } });
      const existingFinished = await tx.lotMovement.findFirst({ where: { lotId: inspection.lotId, type: "FINISHED_GOODS", reference: inspection.folio } });
      if (!existingFinished) {
        await tx.lotMovement.create({ data: { lotId: inspection.lotId, warehouseId: finishedWarehouse?.id, type: "FINISHED_GOODS", hidesQuantity: inspection.lot.currentHides, weightKg: inspection.lot.currentWeightKg, reference: inspection.folio, notes: "Lote liberado por calidad" } });
      }

      if (inspection.lot.productionOrderId) {
        const unfinishedLots = await tx.tanneryLot.count({ where: { productionOrderId: inspection.lot.productionOrderId, status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED", "CONSUMED"] } } });
        if (unfinishedLots === 0) await tx.productionOrder.update({ where: { id: inspection.lot.productionOrderId }, data: { status: "COMPLETED" } });
      }
    } else if (disposition === "HOLD") {
      const lot = await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "ON_HOLD" } });
      lotStatus = lot.status;
    } else if (disposition === "REJECT") {
      const lot = await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "REJECTED" } });
      lotStatus = lot.status;
      await tx.lotMovement.create({ data: { lotId: inspection.lotId, type: "REJECTION", hidesQuantity: inspection.lot.currentHides, weightKg: inspection.lot.currentWeightKg, reference: inspection.folio, notes: "Rechazo por inspección de calidad" } });
    } else {
      const lot = await tx.tanneryLot.update({ where: { id: inspection.lotId }, data: { status: "ON_HOLD", currentProcessCode: "REWORK" } });
      lotStatus = lot.status;
    }
    return { inspection, updatedInspection, lotStatus };
  });

  await writeAuditLog({ actor, action: "QUALITY_INSPECTION_RESOLVED", entityType: "QualityInspection", entityId: inspectionId, before: { status: result.inspection.status, lotStatus: result.inspection.lot.status }, after: { status: result.updatedInspection.status, disposition: result.updatedInspection.disposition, lotStatus: result.lotStatus, lotId: result.inspection.lotId, folio: result.inspection.folio } });
  revalidatePath("/calidad");
  revalidatePath("/lotes");
  revalidatePath("/produccion");
  revalidatePath("/produccion/ordenes");
  revalidatePath("/");
}
