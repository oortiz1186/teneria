"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const passwordSchema = z.string().min(12, "La contraseña debe tener al menos 12 caracteres.");

export async function createUser(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const data = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: passwordSchema
  }).parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password")
  });
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (roleIds.length === 0) throw new Error("Selecciona al menos un rol.");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash,
      status: "ACTIVE",
      roles: { create: roleIds.map(roleId => ({ roleId })) }
    },
    include: { roles: { include: { role: true } } }
  });

  await writeAuditLog({
    actor,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    after: { id: user.id, name: user.name, email: user.email, status: user.status, roles: user.roles.map(r => r.role.code) }
  });
  revalidatePath("/configuracion");
}

export async function updateUserRoles(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const userId = z.string().min(1).parse(formData.get("userId"));
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (roleIds.length === 0) throw new Error("Selecciona al menos un rol.");

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  await prisma.$transaction(async tx => {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roleIds.map(roleId => ({ userId, roleId })) });
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  });

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  await writeAuditLog({
    actor,
    action: "USER_ROLES_UPDATED",
    entityType: "User",
    entityId: userId,
    before: { roles: before.roles.map(r => r.role.code) },
    after: { roles: after.roles.map(r => r.role.code) }
  });
  revalidatePath("/configuracion");
}

export async function toggleUserStatus(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const userId = z.string().min(1).parse(formData.get("userId"));
  if (userId === actor.id) throw new Error("No puedes desactivar tu propia cuenta desde esta pantalla.");

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const nextStatus = before.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const after = await prisma.user.update({
    where: { id: userId },
    data: { status: nextStatus, sessionVersion: { increment: 1 } }
  });

  await writeAuditLog({
    actor,
    action: nextStatus === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId,
    before: { status: before.status },
    after: { status: after.status }
  });
  revalidatePath("/configuracion");
}

export async function resetUserPassword(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const userId = z.string().min(1).parse(formData.get("userId"));
  const password = passwordSchema.parse(formData.get("password"));
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } }
  });

  await writeAuditLog({
    actor,
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: userId,
    after: { passwordReset: true, sessionsRevoked: true }
  });
  revalidatePath("/configuracion");
}
