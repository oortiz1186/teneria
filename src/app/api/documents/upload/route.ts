import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { documentEntityTypes, assertDocumentEntityExists, assertDocumentRole, type DocumentEntityType } from "@/lib/document-access";
import { removeDocumentFile, saveDocumentFile } from "@/lib/document-storage";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const entityTypeRaw = String(form.get("entityType") || "");
    const entityId = String(form.get("entityId") || "").trim();
    const category = String(form.get("category") || "").trim() || null;
    const file = form.get("file");

    if (!documentEntityTypes.includes(entityTypeRaw as DocumentEntityType)) {
      return NextResponse.json({ error: "Tipo de entidad inválido." }, { status: 400 });
    }
    if (!entityId) return NextResponse.json({ error: "Falta la entidad relacionada." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo." }, { status: 400 });

    const entityType = entityTypeRaw as DocumentEntityType;
    assertDocumentRole(user, entityType);
    await assertDocumentEntityExists(entityType, entityId);
    const stored = await saveDocumentFile(file);
    const auditContext = await getAuditContext();

    try {
      const attachment = await prisma.$transaction(async tx => {
        const created = await tx.documentAttachment.create({
          data: {
            entityType,
            entityId,
            category,
            originalName: file.name.slice(0, 240),
            mimeType: file.type,
            sizeBytes: stored.sizeBytes,
            storageProvider: "LOCAL",
            storageKey: stored.storageKey,
            sha256: stored.sha256,
            uploadedById: user.id,
            uploadedByEmail: user.email
          }
        });
        await writeAuditLogWithClient(tx, {
          actor: user,
          context: auditContext,
          action: "DOCUMENT_UPLOADED",
          entityType: "DocumentAttachment",
          entityId: created.id,
          after: { relatedEntityType: entityType, relatedEntityId: entityId, category, originalName: created.originalName, mimeType: created.mimeType, sizeBytes: created.sizeBytes, sha256: created.sha256 }
        });
        return created;
      });
      return NextResponse.json({ id: attachment.id, ok: true });
    } catch (error) {
      await removeDocumentFile(stored.storageKey);
      throw error;
    }
  } catch (error) {
    console.error("Document upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el documento." }, { status: 400 });
  }
}
