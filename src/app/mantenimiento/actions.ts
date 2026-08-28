"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createFolio } from "@/lib/folio";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

const maintenanceRoles = ["MAINTENANCE", "PRODUCTION"];

export async function createMaintenancePlan(formData: FormData) {
  const actor = await requireRole(maintenanceRoles);
  const auditContext = await getAuditContext();
  const data = z.object({
    machineId: z.string().min(1),
    name: z.string().min(2),
    description: z.string().optional(),
    frequencyDays: z.coerce.number().int().positive().optional(),
    frequencyHours: z.coerce.number().int().positive().optional(),
    nextDueAt: z.string().optional(),
    notes: z.string().optional()
  }).parse({
    machineId: formData.get("machineId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    frequencyDays: formData.get("frequencyDays") || undefined,
    frequencyHours: formData.get("frequencyHours") || undefined,
    nextDueAt: formData.get("nextDueAt") || undefined,
    notes: formData.get("notes") || undefined
  });

  if (!data.frequencyDays && !data.frequencyHours) throw new Error("Define una frecuencia por días u horas.");

  await prisma.$transaction(async tx => {
    const machine = await tx.machine.findUniqueOrThrow({ where: { id: data.machineId } });
    const plan = await tx.maintenancePlan.create({
      data: {
        machineId: data.machineId,
        name: data.name.trim(),
        description: data.description,
        frequencyDays: data.frequencyDays,
        frequencyHours: data.frequencyHours,
        nextDueAt: data.nextDueAt ? new Date(`${data.nextDueAt}T12:00:00`) : null,
        notes: data.notes
      }
    });
    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "MAINTENANCE_PLAN_CREATED",
      entityType: "MaintenancePlan",
      entityId: plan.id,
      after: { machineId: machine.id, machineCode: machine.code, name: plan.name, frequencyDays: plan.frequencyDays, frequencyHours: plan.frequencyHours, nextDueAt: plan.nextDueAt }
    });
  });
  revalidatePath("/mantenimiento");
}

export async function createMaintenanceOrder(formData: FormData) {
  const actor = await requireRole(maintenanceRoles);
  const auditContext = await getAuditContext();
  const data = z.object({
    machineId: z.string().min(1),
    planId: z.string().optional(),
    type: z.enum(["PREVENTIVE", "CORRECTIVE", "INSPECTION"]),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    description: z.string().min(3),
    technicianName: z.string().optional(),
    scheduledAt: z.string().optional(),
    notes: z.string().optional()
  }).parse({
    machineId: formData.get("machineId"),
    planId: formData.get("planId") || undefined,
    type: formData.get("type"),
    priority: formData.get("priority"),
    description: formData.get("description"),
    technicianName: formData.get("technicianName") || undefined,
    scheduledAt: formData.get("scheduledAt") || undefined,
    notes: formData.get("notes") || undefined
  });

  await prisma.$transaction(async tx => {
    const machine = await tx.machine.findUniqueOrThrow({ where: { id: data.machineId } });
    if (data.planId) {
      const plan = await tx.maintenancePlan.findUniqueOrThrow({ where: { id: data.planId } });
      if (plan.machineId !== machine.id) throw new Error("El plan seleccionado no corresponde a la máquina.");
    }
    const order = await tx.maintenanceWorkOrder.create({
      data: {
        folio: createFolio("MTO"),
        machineId: machine.id,
        planId: data.planId,
        type: data.type,
        priority: data.priority,
        status: data.scheduledAt ? "SCHEDULED" : "OPEN",
        description: data.description.trim(),
        technicianName: data.technicianName,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        notes: data.notes
      }
    });
    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "MAINTENANCE_ORDER_CREATED",
      entityType: "MaintenanceWorkOrder",
      entityId: order.id,
      after: { folio: order.folio, machineId: machine.id, machineCode: machine.code, type: order.type, priority: order.priority, status: order.status, scheduledAt: order.scheduledAt }
    });
  });
  revalidatePath("/mantenimiento");
}

export async function startMaintenanceOrder(formData: FormData) {
  const actor = await requireRole(maintenanceRoles);
  const auditContext = await getAuditContext();
  const orderId = z.string().min(1).parse(formData.get("orderId"));

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MaintenanceWorkOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: orderId }, include: { machine: true } });
    if (!["OPEN", "SCHEDULED"].includes(order.status)) throw new Error("La orden ya no puede iniciarse.");

    const claimed = await tx.machine.updateMany({
      where: { id: order.machineId, active: true, status: "AVAILABLE" },
      data: { status: "MAINTENANCE" }
    });
    if (claimed.count !== 1) {
      throw new Error("La máquina ya no está disponible para mantenimiento. Puede estar en producción, inactiva o tomada por otra orden; actualiza la pantalla.");
    }

    const updated = await tx.maintenanceWorkOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "MAINTENANCE_ORDER_STARTED",
      entityType: "MaintenanceWorkOrder",
      entityId: order.id,
      before: { status: order.status, machineStatus: order.machine.status },
      after: { status: updated.status, machineStatus: "MAINTENANCE", startedAt: updated.startedAt }
    });
  });
  revalidatePath("/mantenimiento");
  revalidatePath("/operacion");
  revalidatePath("/");
}

export async function completeMaintenanceOrder(formData: FormData) {
  const actor = await requireRole(maintenanceRoles);
  const auditContext = await getAuditContext();
  const data = z.object({
    orderId: z.string().min(1),
    resolution: z.string().min(3),
    downtimeMinutes: z.coerce.number().int().nonnegative().optional(),
    laborCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional()
  }).parse({
    orderId: formData.get("orderId"),
    resolution: formData.get("resolution"),
    downtimeMinutes: formData.get("downtimeMinutes") || undefined,
    laborCost: formData.get("laborCost") || undefined,
    notes: formData.get("notes") || undefined
  });

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MaintenanceWorkOrder" WHERE id = ${data.orderId} FOR UPDATE`;
    const order = await tx.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: data.orderId }, include: { machine: true, plan: true } });
    if (order.status !== "IN_PROGRESS") throw new Error("La orden debe estar en proceso para poder cerrarse.");
    if (order.machine.status !== "MAINTENANCE") throw new Error("La máquina ya no está marcada en mantenimiento. Actualiza la pantalla antes de cerrar la orden.");

    const parts = await tx.maintenancePartUsage.aggregate({ where: { workOrderId: order.id }, _sum: { totalCost: true } });
    const partsCost = Number(parts._sum.totalCost ?? 0);
    const laborCost = data.laborCost ?? Number(order.laborCost);
    const completedAt = new Date();
    const totalCost = laborCost + partsCost;
    const updated = await tx.maintenanceWorkOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", completedAt, resolution: data.resolution.trim(), downtimeMinutes: data.downtimeMinutes, laborCost, partsCost, totalCost, notes: data.notes ?? order.notes }
    });
    const released = await tx.machine.updateMany({ where: { id: order.machineId, status: "MAINTENANCE" }, data: { status: "AVAILABLE" } });
    if (released.count !== 1) throw new Error("No fue posible liberar la máquina porque su estado cambió durante el cierre.");

    if (order.planId && order.plan) {
      const nextDueAt = order.plan.frequencyDays ? new Date(completedAt.getTime() + order.plan.frequencyDays * 86400000) : order.plan.nextDueAt;
      await tx.maintenancePlan.update({ where: { id: order.planId }, data: { lastPerformedAt: completedAt, nextDueAt } });
    }

    await writeAuditLogWithClient(tx, {
      actor,
      context: auditContext,
      action: "MAINTENANCE_ORDER_COMPLETED",
      entityType: "MaintenanceWorkOrder",
      entityId: order.id,
      before: { status: order.status, machineStatus: order.machine.status },
      after: { status: updated.status, machineStatus: "AVAILABLE", completedAt, downtimeMinutes: updated.downtimeMinutes, laborCost: updated.laborCost, partsCost: updated.partsCost, totalCost: updated.totalCost, resolution: updated.resolution }
    });
  });
  revalidatePath("/mantenimiento");
  revalidatePath("/operacion");
  revalidatePath("/");
}

export async function createMaintenancePart(formData: FormData) {
  const actor = await requireRole(["MAINTENANCE", "WAREHOUSE"]);
  const auditContext = await getAuditContext();
  const data = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    unit: z.string().min(1),
    minStock: z.coerce.number().nonnegative().optional(),
    currentStock: z.coerce.number().nonnegative().optional(),
    unitCost: z.coerce.number().nonnegative().optional(),
    description: z.string().optional()
  }).parse({
    code: String(formData.get("code") || "").trim().toUpperCase(),
    name: formData.get("name"),
    unit: formData.get("unit") || "pz",
    minStock: formData.get("minStock") || undefined,
    currentStock: formData.get("currentStock") || undefined,
    unitCost: formData.get("unitCost") || undefined,
    description: formData.get("description") || undefined
  });

  await prisma.$transaction(async tx => {
    const part = await tx.maintenancePart.create({ data: { ...data, currentStock: data.currentStock ?? 0, unitCost: data.unitCost ?? 0 } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "MAINTENANCE_PART_CREATED", entityType: "MaintenancePart", entityId: part.id, after: { code: part.code, name: part.name, unit: part.unit, minStock: part.minStock, currentStock: part.currentStock, unitCost: part.unitCost } });
  });
  revalidatePath("/mantenimiento");
}

export async function receiveMaintenancePart(formData: FormData) {
  const actor = await requireRole(["MAINTENANCE", "WAREHOUSE"]);
  const auditContext = await getAuditContext();
  const partId = z.string().min(1).parse(formData.get("partId"));
  const quantity = z.coerce.number().positive().parse(formData.get("quantity"));
  const unitCostRaw = formData.get("unitCost");
  const unitCost = unitCostRaw ? z.coerce.number().nonnegative().parse(unitCostRaw) : undefined;

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MaintenancePart" WHERE id = ${partId} FOR UPDATE`;
    const before = await tx.maintenancePart.findUniqueOrThrow({ where: { id: partId } });
    const after = await tx.maintenancePart.update({ where: { id: partId }, data: { currentStock: { increment: quantity }, ...(unitCost === undefined ? {} : { unitCost }) } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "MAINTENANCE_PART_RECEIVED", entityType: "MaintenancePart", entityId: partId, before: { currentStock: before.currentStock, unitCost: before.unitCost }, after: { currentStock: after.currentStock, unitCost: after.unitCost, receivedQuantity: quantity } });
  });
  revalidatePath("/mantenimiento");
}

export async function consumeMaintenancePart(formData: FormData) {
  const actor = await requireRole(maintenanceRoles);
  const auditContext = await getAuditContext();
  const workOrderId = z.string().min(1).parse(formData.get("workOrderId"));
  const partId = z.string().min(1).parse(formData.get("partId"));
  const quantity = z.coerce.number().positive().parse(formData.get("quantity"));

  await prisma.$transaction(async tx => {
    const order = await tx.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    if (order.status !== "IN_PROGRESS") throw new Error("Sólo puedes consumir refacciones en una orden de mantenimiento en proceso.");
    const part = await tx.maintenancePart.findUniqueOrThrow({ where: { id: partId } });
    const changed = await tx.maintenancePart.updateMany({ where: { id: partId, active: true, currentStock: { gte: quantity } }, data: { currentStock: { decrement: quantity } } });
    if (changed.count !== 1) throw new Error("Existencia insuficiente de la refacción seleccionada.");
    const totalCost = Number(part.unitCost) * quantity;
    const usage = await tx.maintenancePartUsage.create({ data: { workOrderId, partId, quantity, unitCost: part.unitCost, totalCost } });
    await tx.maintenanceWorkOrder.update({ where: { id: workOrderId }, data: { partsCost: { increment: totalCost }, totalCost: { increment: totalCost } } });
    const after = await tx.maintenancePart.findUniqueOrThrow({ where: { id: partId } });
    await writeAuditLogWithClient(tx, { actor, context: auditContext, action: "MAINTENANCE_PART_CONSUMED", entityType: "MaintenancePart", entityId: partId, before: { currentStock: part.currentStock }, after: { currentStock: after.currentStock, quantity, usageId: usage.id, workOrderId, totalCost } });
  });
  revalidatePath("/mantenimiento");
}
