"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function setMachineMaintenance(formData: FormData) {
  const machineId = z.string().min(1).parse(formData.get("machineId"));
  const notes = String(formData.get("notes") || "").trim();
  await prisma.machine.update({ where: { id: machineId }, data: { status: "MAINTENANCE", notes: notes || "Equipo enviado a mantenimiento" } });
  revalidatePath("/operacion");
  revalidatePath("/");
}

export async function releaseMachine(formData: FormData) {
  const machineId = z.string().min(1).parse(formData.get("machineId"));
  await prisma.machine.update({ where: { id: machineId }, data: { status: "AVAILABLE" } });
  revalidatePath("/operacion");
  revalidatePath("/");
}
