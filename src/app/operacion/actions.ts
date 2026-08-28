"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function setMachineMaintenance(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const machineId = z.string().min(1).parse(formData.get("machineId"));
  const notes = String(formData.get("notes") || "").trim();

  const before = await prisma.machine.findUniqueOrThrow({ where: { id: machineId } });
  if (before.status === "IN_USE") throw new Error("No se puede enviar a mantenimiento una máquina que tiene un proceso activo.");
  if (before.status === "MAINTENANCE") throw new Error("La máquina ya está en mantenimiento.");

  const machine = await prisma.machine.update({
    where: { id: machineId },
    data: { status: "MAINTENANCE", notes: notes || "Equipo enviado a mantenimiento" }
  });

  await writeAuditLog({
    actor,
    action: "MACHINE_SENT_TO_MAINTENANCE",
    entityType: "Machine",
    entityId: machine.id,
    before: { status: before.status, notes: before.notes },
    after: { code: machine.code, status: machine.status, notes: machine.notes }
  });
  revalidatePath("/operacion");
  revalidatePath("/");
}

export async function releaseMachine(formData: FormData) {
  const actor = await requireRole(["PRODUCTION"]);
  const machineId = z.string().min(1).parse(formData.get("machineId"));
  const before = await prisma.machine.findUniqueOrThrow({ where: { id: machineId } });
  if (before.status !== "MAINTENANCE") throw new Error("Sólo se puede liberar una máquina que esté en mantenimiento.");

  const machine = await prisma.machine.update({
    where: { id: machineId },
    data: { status: "AVAILABLE" }
  });
  await writeAuditLog({
    actor,
    action: "MACHINE_RELEASED",
    entityType: "Machine",
    entityId: machine.id,
    before: { status: before.status, notes: before.notes },
    after: { code: machine.code, status: machine.status, notes: machine.notes }
  });
  revalidatePath("/operacion");
  revalidatePath("/");
}
