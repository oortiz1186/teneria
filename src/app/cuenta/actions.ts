"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth-token";
import { writeAuditLog } from "@/lib/audit";

const passwordSchema = z.string().min(12, "La nueva contraseña debe tener al menos 12 caracteres.");

export async function changeOwnPassword(formData: FormData) {
  const actor = await requireUser();
  const data = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: passwordSchema
  }).parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (data.newPassword !== data.confirmPassword) {
    redirect("/cuenta?error=confirm");
  }
  if (data.currentPassword === data.newPassword) {
    redirect("/cuenta?error=same");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.passwordHash) redirect("/cuenta?error=current");

  const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!valid) redirect("/cuenta?error=current");

  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  await prisma.user.update({
    where: { id: actor.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      sessionVersion: { increment: 1 }
    }
  });

  await writeAuditLog({
    actor,
    action: "USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: actor.id,
    after: { passwordChanged: true, sessionsRevoked: true }
  });

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login?passwordChanged=1");
}
