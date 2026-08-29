import { prisma } from "@/lib/prisma";

type AppUser = { id: string; email: string; roles: string[] };

export const documentEntityTypes = [
  "TANNERY_LOT",
  "QUALITY_INSPECTION",
  "MAINTENANCE_WORK_ORDER",
  "SUPPLIER_INVOICE",
  "ACCOUNT_RECEIVABLE",
  "RAW_HIDE_RECEIPT",
  "PURCHASE_ORDER",
  "SALES_ORDER"
] as const;

export type DocumentEntityType = typeof documentEntityTypes[number];

const roleMap: Record<DocumentEntityType, string[]> = {
  TANNERY_LOT: ["PRODUCTION", "WAREHOUSE", "QUALITY"],
  QUALITY_INSPECTION: ["QUALITY"],
  MAINTENANCE_WORK_ORDER: ["MAINTENANCE", "PRODUCTION", "WAREHOUSE"],
  SUPPLIER_INVOICE: ["PURCHASING", "FINANCE"],
  ACCOUNT_RECEIVABLE: ["SALES", "FINANCE"],
  RAW_HIDE_RECEIPT: ["WAREHOUSE", "PURCHASING", "PRODUCTION"],
  PURCHASE_ORDER: ["PURCHASING", "WAREHOUSE"],
  SALES_ORDER: ["SALES", "FINANCE"]
};

export function canAccessDocumentType(user: AppUser, entityType: DocumentEntityType) {
  return user.roles.includes("ADMIN") || roleMap[entityType].some(role => user.roles.includes(role));
}

export function assertDocumentRole(user: AppUser, entityType: DocumentEntityType) {
  if (!canAccessDocumentType(user, entityType)) {
    throw new Error("No tienes permisos para consultar documentos de esta entidad.");
  }
}

export async function assertDocumentEntityExists(entityType: DocumentEntityType, entityId: string) {
  const exists = await ({
    TANNERY_LOT: () => prisma.tanneryLot.findUnique({ where: { id: entityId }, select: { id: true } }),
    QUALITY_INSPECTION: () => prisma.qualityInspection.findUnique({ where: { id: entityId }, select: { id: true } }),
    MAINTENANCE_WORK_ORDER: () => prisma.maintenanceWorkOrder.findUnique({ where: { id: entityId }, select: { id: true } }),
    SUPPLIER_INVOICE: () => prisma.supplierInvoice.findUnique({ where: { id: entityId }, select: { id: true } }),
    ACCOUNT_RECEIVABLE: () => prisma.accountReceivable.findUnique({ where: { id: entityId }, select: { id: true } }),
    RAW_HIDE_RECEIPT: () => prisma.rawHideReceipt.findUnique({ where: { id: entityId }, select: { id: true } }),
    PURCHASE_ORDER: () => prisma.purchaseOrder.findUnique({ where: { id: entityId }, select: { id: true } }),
    SALES_ORDER: () => prisma.salesOrder.findUnique({ where: { id: entityId }, select: { id: true } })
  } satisfies Record<DocumentEntityType, () => Promise<{ id: string } | null>>)[entityType]();
  if (!exists) throw new Error("La entidad relacionada ya no existe.");
}
