import { headers } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditActor = { id: string; email: string };
type AuditClient = Prisma.TransactionClient | PrismaClient;

export type AuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

function jsonSafe(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item && typeof item === "object" && "toNumber" in item && typeof item.toNumber === "function") return item.toString();
    return item;
  }));
}

export async function getAuditContext(): Promise<AuditContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")
  };
}

export async function writeAuditLogWithClient(client: AuditClient, input: {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  context: AuditContext;
}) {
  await client.auditLog.create({
    data: {
      userId: input.actor?.id ?? null,
      userEmail: input.actor?.email ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: jsonSafe(input.before),
      afterJson: jsonSafe(input.after),
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent
    }
  });
}

export async function writeAuditLog(input: {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  const context = await getAuditContext();
  await writeAuditLogWithClient(prisma, { ...input, context });
}
