"use server";

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

  const configuredEmail = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (!configuredEmail || !configuredPassword || configuredPassword.length < 12) {
    throw new Error("Configura AUTH_BOOTSTRAP_EMAIL y AUTH_BOOTSTRAP_PASSWORD (mínimo 12 caracteres).");
  }

  const normalizedEmail = data.email.trim().toLowerCase();
  if (normalizedEmail !== configuredEmail || data.password !== configuredPassword) {
    redirect("/login?error=1");
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { roles: { include: { role: true } } }
  });
  if (!user || user.status !== "ACTIVE") redirect("/login?error=1");

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map(r => r.role.code)
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
