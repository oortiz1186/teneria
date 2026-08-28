"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const startSchema = z.object({ lotId: z.string().min(1), processId: z.string().min(1), machineId: z.string().optional() });
const completeSchema = z.object({ executionId: z.string().min(1), outputHides: z.coerce.number().int().nonnegative(), outputWeightKg: z.coerce.number().nonnegative(), temperatureC: z.coerce.number().optional(), ph: z.coerce.number().optional(), notes: z.string().optional() });

export async function startProcess(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const data = startSchema.parse({ lotId: formData.get("lotId"), processId: formData.get("processId"), machineId: formData.get("machineId") || undefined });

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "TanneryLot" WHERE id = ${data.lotId} FOR UPDATE`;
    const lot = await tx.tanneryLot.findUniqueOrThrow({ where: { id: data.lotId } });
    if (["COMPLETED", "REJECTED", "CANCELLED", "CONSUMED"].includes(lot.status)) throw new Error("El lote está cerrado y no admite nuevos procesos.");

    const process = await tx.processCatalog.findUniqueOrThrow({ where: { id: data.processId } });
    const active = await tx.lotProcess.findFirst({ where: { lotId: lot.id, status: "IN_PROGRESS" } });
    if (active) throw new Error("El lote ya tiene un proceso activo.");

    if (data.machineId) {
      const machine = await tx.machine.findUniqueOrThrow({ where: { id: data.machineId } });
      if (machine.capacityKg && Number(lot.currentWeightKg) > Number(machine.capacityKg)) throw new Error("El peso del lote excede la capacidad de la máquina seleccionada.");
      const claimed = await tx.machine.updateMany({
        where: { id: data.machineId, active: true, status: "AVAILABLE" },
        data: { status: "IN_USE" }
      });
      if (claimed.count !== 1) throw new Error("La máquina fue tomada por otro usuario. Actualiza la pantalla y selecciona otra máquina disponible.");
    }

    const pendingSteps = await tx.lotProcess.findMany({ where: { lotId: lot.id, status: "PENDING" }, include: { routeStep: true } });
    pendingSteps.sort((a,b) => (a.routeStep?.sequence ?? 999999) - (b.routeStep?.sequence ?? 999999));

    let executionId: string;
    if (pendingSteps.length > 0) {
      const next = pendingSteps[0];
      if (next.processId !== process.id) throw new Error("El proceso seleccionado no es el siguiente paso de la ruta del lote.");
      const started = await tx.lotProcess.updateMany({
        where: { id: next.id, status: "PENDING" },
        data: { machineId: data.machineId, status: "IN_PROGRESS", startedAt: new Date(), inputHides: lot.currentHides, inputWeightKg: lot.currentWeightKg }
      });
      if (started.count !== 1) throw new Error("El paso de producción cambió mientras intentabas iniciarlo. Actualiza la pantalla.");
      executionId = next.id;
    } else {
      const created = await tx.lotProcess.create({ data: { lotId: lot.id, processId: process.id, productionOrderId: lot.productionOrderId, machineId: data.machineId, status: "IN_PROGRESS", startedAt: new Date(), inputHides: lot.currentHides, inputWeightKg: lot.currentWeightKg } });
      executionId = created.id;
    }

    await tx.tanneryLot.update({ where: { id: lot.id }, data: { status: "IN_PROCESS", currentProcessCode: process.code } });
    await tx.lotMovement.create({ data: { lotId: lot.id, type: "PROCESS_IN", hidesQuantity: lot.currentHides, weightKg: lot.currentWeightKg, reference: `${process.code}:${executionId}` } });
    return { lot, process, executionId };
  });

  await writeAuditLog({ actor, action: "PROCESS_STARTED", entityType: "LotProcess", entityId: result.executionId, before: { lotStatus: result.lot.status, currentProcessCode: result.lot.currentProcessCode }, after: { lotId: result.lot.id, lotFolio: result.lot.folio, processId: result.process.id, processCode: result.process.code, machineId: data.machineId ?? null, inputHides: result.lot.currentHides, inputWeightKg: result.lot.currentWeightKg } });
  revalidatePath("/produccion"); revalidatePath("/lotes"); revalidatePath("/");
}

export async function completeProcess(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const rawTemp = formData.get("temperatureC");
  const rawPh = formData.get("ph");
  const data = completeSchema.parse({ executionId: formData.get("executionId"), outputHides: formData.get("outputHides"), outputWeightKg: formData.get("outputWeightKg"), temperatureC: rawTemp === "" ? undefined : rawTemp, ph: rawPh === "" ? undefined : rawPh, notes: formData.get("notes") || undefined });

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "LotProcess" WHERE id = ${data.executionId} FOR UPDATE`;
    const execution = await tx.lotProcess.findUniqueOrThrow({ where: { id: data.executionId }, include: { lot: true, process: true } });
    if (execution.status !== "IN_PROGRESS") throw new Error("El proceso ya no está activo.");
    if (data.outputHides > execution.lot.currentHides) throw new Error("La salida no puede exceder las pieles actuales del lote.");

    const completed = await tx.lotProcess.updateMany({
      where: { id: execution.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date(), outputHides: data.outputHides, outputWeightKg: data.outputWeightKg, temperatureC: data.temperatureC, ph: data.ph, notes: data.notes }
    });
    if (completed.count !== 1) throw new Error("El proceso fue cerrado por otro usuario. Actualiza la pantalla.");

    const remaining = await tx.lotProcess.count({ where: { lotId: execution.lotId, status: { in: ["PENDING", "IN_PROGRESS"] } } });
    const routeFinished = remaining === 0 && Boolean(execution.productionOrderId) && Boolean(execution.routeStepId);
    const awaitingQualityRelease = routeFinished && execution.process.code === "QUALITY";
    const nextStatus = awaitingQualityRelease ? "ON_HOLD" : routeFinished ? "COMPLETED" : "IN_PROCESS";

    const updatedLot = await tx.tanneryLot.update({ where: { id: execution.lotId }, data: { currentHides: data.outputHides, currentWeightKg: data.outputWeightKg, currentProcessCode: execution.process.code, status: nextStatus } });
    if (execution.machineId) {
      await tx.machine.updateMany({ where: { id: execution.machineId, status: "IN_USE" }, data: { status: "AVAILABLE" } });
    }

    await tx.lotMovement.create({ data: { lotId: execution.lotId, type: "PROCESS_OUT", hidesQuantity: data.outputHides, weightKg: data.outputWeightKg, reference: execution.process.code, notes: data.notes } });

    if (routeFinished && !awaitingQualityRelease) {
      const finishedWarehouse = await tx.warehouse.findUnique({ where: { code: "PT" } });
      await tx.lotMovement.create({ data: { lotId: execution.lotId, warehouseId: finishedWarehouse?.id, type: "FINISHED_GOODS", hidesQuantity: data.outputHides, weightKg: data.outputWeightKg, reference: execution.productionOrderId ?? undefined, notes: "Ruta de producción completada" } });
    }

    if (execution.productionOrderId && !awaitingQualityRelease) {
      const unfinishedLots = await tx.tanneryLot.count({ where: { productionOrderId: execution.productionOrderId, status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED", "CONSUMED"] } } });
      if (unfinishedLots === 0) await tx.productionOrder.update({ where: { id: execution.productionOrderId }, data: { status: "COMPLETED" } });
    }
    return { execution, updatedLot, routeFinished, awaitingQualityRelease };
  });

  await writeAuditLog({ actor, action: "PROCESS_COMPLETED", entityType: "LotProcess", entityId: data.executionId, before: { lotStatus: result.execution.lot.status, hides: result.execution.lot.currentHides, weightKg: result.execution.lot.currentWeightKg }, after: { lotId: result.execution.lotId, lotFolio: result.execution.lot.folio, processCode: result.execution.process.code, outputHides: data.outputHides, outputWeightKg: data.outputWeightKg, temperatureC: data.temperatureC, ph: data.ph, lotStatus: result.updatedLot.status, routeFinished: result.routeFinished, awaitingQualityRelease: result.awaitingQualityRelease } });
  revalidatePath("/produccion"); revalidatePath("/produccion/ordenes"); revalidatePath("/lotes"); revalidatePath("/calidad"); revalidatePath("/");
}
