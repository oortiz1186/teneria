"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const startSchema = z.object({
  lotId: z.string().min(1),
  processId: z.string().min(1),
  machineId: z.string().optional()
});

const completeSchema = z.object({
  executionId: z.string().min(1),
  outputHides: z.coerce.number().int().nonnegative(),
  outputWeightKg: z.coerce.number().nonnegative(),
  temperatureC: z.coerce.number().optional(),
  ph: z.coerce.number().optional(),
  notes: z.string().optional()
});

export async function startProcess(formData: FormData) {
  const data = startSchema.parse({
    lotId: formData.get("lotId"),
    processId: formData.get("processId"),
    machineId: formData.get("machineId") || undefined
  });

  await prisma.$transaction(async (tx) => {
    const lot = await tx.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });
    const process = await tx.processCatalog.findUniqueOrThrow({ where: { id: data.processId } });

    const active = await tx.lotProcess.findFirst({
      where: { lotId: lot.id, status: "IN_PROGRESS" }
    });
    if (active) throw new Error("El lote ya tiene un proceso activo.");

    if (data.machineId) {
      const machineBusy = await tx.lotProcess.findFirst({
        where: { machineId: data.machineId, status: "IN_PROGRESS" }
      });
      if (machineBusy) throw new Error("La máquina seleccionada está ocupada.");
    }

    await tx.lotProcess.create({
      data: {
        lotId: lot.id,
        processId: process.id,
        machineId: data.machineId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        inputHides: lot.currentHides,
        inputWeightKg: lot.currentWeightKg
      }
    });

    await tx.tanneryLot.update({
      where: { id: lot.id },
      data: { status: "IN_PROCESS", currentProcessCode: process.code }
    });

    if (data.machineId) {
      await tx.machine.update({ where: { id: data.machineId }, data: { status: "IN_USE" } });
    }

    await tx.lotMovement.create({
      data: {
        lotId: lot.id,
        type: "PROCESS_IN",
        hidesQuantity: lot.currentHides,
        weightKg: lot.currentWeightKg,
        reference: process.code
      }
    });
  });

  revalidatePath("/produccion");
  revalidatePath("/lotes");
  revalidatePath("/");
}

export async function completeProcess(formData: FormData) {
  const rawTemp = formData.get("temperatureC");
  const rawPh = formData.get("ph");
  const data = completeSchema.parse({
    executionId: formData.get("executionId"),
    outputHides: formData.get("outputHides"),
    outputWeightKg: formData.get("outputWeightKg"),
    temperatureC: rawTemp === "" ? undefined : rawTemp,
    ph: rawPh === "" ? undefined : rawPh,
    notes: formData.get("notes") || undefined
  });

  await prisma.$transaction(async (tx) => {
    const execution = await tx.lotProcess.findUniqueOrThrow({
      where: { id: data.executionId },
      include: { lot: true, process: true }
    });

    if (execution.status !== "IN_PROGRESS") throw new Error("El proceso ya no está activo.");
    if (data.outputHides > execution.lot.currentHides) throw new Error("La salida no puede exceder las pieles actuales del lote.");

    await tx.lotProcess.update({
      where: { id: execution.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputHides: data.outputHides,
        outputWeightKg: data.outputWeightKg,
        temperatureC: data.temperatureC,
        ph: data.ph,
        notes: data.notes
      }
    });

    await tx.tanneryLot.update({
      where: { id: execution.lotId },
      data: {
        currentHides: data.outputHides,
        currentWeightKg: data.outputWeightKg,
        currentProcessCode: execution.process.code
      }
    });

    if (execution.machineId) {
      await tx.machine.update({ where: { id: execution.machineId }, data: { status: "AVAILABLE" } });
    }

    await tx.lotMovement.create({
      data: {
        lotId: execution.lotId,
        type: "PROCESS_OUT",
        hidesQuantity: data.outputHides,
        weightKg: data.outputWeightKg,
        reference: execution.process.code,
        notes: data.notes
      }
    });
  });

  revalidatePath("/produccion");
  revalidatePath("/lotes");
  revalidatePath("/");
}
