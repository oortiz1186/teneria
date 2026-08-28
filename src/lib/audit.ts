import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type AuditActor = { id: string; email: string };

function jsonSafe(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item && typeof item === "object" && "toNumber" in item && typeof item.toNumber === "function") return item.toString();
    return item;
  }));
}

export async function writeAuditLog(input: {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwarded || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent");

  await prisma.auditLog.create({
    data: {
      userId: input.actor?.id ?? null,
      userEmail: input.actor?.email ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: jsonSafe(input.before),
      afterJson: jsonSafe(input.after),
      ipAddress,
      userAgent
    }
  });
}
