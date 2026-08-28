import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-token";

export async function getCurrentSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { roles: { include: { role: true } } }
  });
  if (!user || user.status !== "ACTIVE") redirect("/login");

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles.map(r => r.role.code)
  };
}

export async function requireRole(allowed: string[]) {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN") && !user.roles.some(role => allowed.includes(role))) {
    throw new Error("No tienes permisos para realizar esta operación.");
  }
  return user;
}
