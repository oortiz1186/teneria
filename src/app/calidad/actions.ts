"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

function folio(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
}

export async function createInspection(formData: FormData) {
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
    processId = lp?.processId;
  }

  await prisma.qualityInspection.create({
    data: {
      folio: folio("QC"),
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
  const inspectionId = String(formData.get("inspectionId"));
  const defectId = String(formData.get("defectId"));
  const severity = String(formData.get("severity")) as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const affectedHidesRaw = formData.get("affectedHides");
  const affectedAreaRaw = formData.get("affectedAreaDm2");

  await prisma.qualityDefectFinding.create({
    data: {
      inspectionId,
      defectId,
      severity,
      affectedHides: affectedHidesRaw ? Number(affectedHidesRaw) : null,
      affectedAreaDm2: affectedAreaRaw ? Number(affectedAreaRaw) : null,
      notes: String(formData.get("notes") || "") || null
    }
  });

  revalidatePath("/calidad");
}

export async function addEvidence(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId"));
  const fileUrl = String(formData.get("fileUrl"));
  const fileName = String(formData.get("fileName") || "") || null;
  const notes = String(formData.get("notes") || "") || null;

  if (!fileUrl) throw new Error("La URL de evidencia es obligatoria.");

  await prisma.qualityEvidence.create({
    data: { inspectionId, fileUrl, fileName, notes }
  });

  revalidatePath("/calidad");
}

export async function resolveInspection(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId"));
  const disposition = String(formData.get("disposition")) as "RELEASE" | "REWORK" | "REJECT" | "HOLD";

  await prisma.$transaction(async tx => {
    const inspection = await tx.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId } });

    const status = disposition === "RELEASE"
      ? "APPROVED"
      : disposition === "REWORK"
        ? "REWORK_REQUIRED"
        : disposition === "REJECT"
          ? "REJECTED"
          : "CONDITIONAL";

    await tx.qualityInspection.update({
      where: { id: inspectionId },
      data: {
        status,
        disposition,
        releasedAt: disposition === "RELEASE" ? new Date() : null
      }
    });

    if (disposition === "RELEASE") {
      await tx.tanneryLot.update({
        where: { id: inspection.lotId },
        data: { status: "COMPLETED", currentProcessCode: "QUALITY" }
      });
    }

    if (disposition === "HOLD") {
      await tx.tanneryLot.update({
        where: { id: inspection.lotId },
        data: { status: "ON_HOLD" }
      });
    }

    if (disposition === "REJECT") {
      await tx.tanneryLot.update({
        where: { id: inspection.lotId },
        data: { status: "REJECTED" }
      });
      await tx.lotMovement.create({
        data: {
          lotId: inspection.lotId,
          type: "REJECTION",
          hidesQuantity: (await tx.tanneryLot.findUniqueOrThrow({ where: { id: inspection.lotId } })).currentHides,
          reference: inspection.folio,
          notes: "Rechazo por inspección de calidad"
        }
      });
    }

    if (disposition === "REWORK") {
      await tx.tanneryLot.update({
        where: { id: inspection.lotId },
        data: { status: "ON_HOLD", currentProcessCode: "REWORK" }
      });
    }
  });

  revalidatePath("/calidad");
  revalidatePath("/lotes");
  revalidatePath("/produccion");
  revalidatePath("/");
}
