"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth-token";

export async function loginAction(formData: FormData) {
  const data = z.object({
    email: z.string().email(),
    password: z.string().min(8)
  }).parse({ email: formData.get("email"), password: formData.get("password") });

  const normalizedEmail = data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { roles: { include: { role: true } } }
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) redirect("/login?error=1");
  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) redirect("/login?error=1");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map(r => r.role.code),
    sessionVersion: user.sessionVersion
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
