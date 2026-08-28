import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertDocumentEntityExists, assertDocumentRole, documentEntityTypes, type DocumentEntityType } from "@/lib/document-access";
import { loadDocumentFile, removeDocumentFile } from "@/lib/document-storage";
import { getAuditContext, writeAuditLogWithClient } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const attachment = await prisma.documentAttachment.findUnique({ where: { id } });
    if (!attachment || attachment.deletedAt) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    if (!documentEntityTypes.includes(attachment.entityType as DocumentEntityType)) return NextResponse.json({ error: "Tipo de entidad inválido." }, { status: 400 });
    const entityType = attachment.entityType as DocumentEntityType;
    assertDocumentRole(user, entityType);
    await assertDocumentEntityExists(entityType, attachment.entityId);
    const bytes = await loadDocumentFile(attachment.storageKey);
    const disposition = request.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("Document download failed", error);
    return NextResponse.json({ error: "No se pudo abrir el documento." }, { status: 403 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const attachment = await prisma.documentAttachment.findUnique({ where: { id } });
    if (!attachment || attachment.deletedAt) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    if (!documentEntityTypes.includes(attachment.entityType as DocumentEntityType)) return NextResponse.json({ error: "Tipo de entidad inválido." }, { status: 400 });
    const entityType = attachment.entityType as DocumentEntityType;
    assertDocumentRole(user, entityType);
    const auditContext = await getAuditContext();
    await prisma.$transaction(async tx => {
      await tx.documentAttachment.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAuditLogWithClient(tx, {
        actor: user,
        context: auditContext,
        action: "DOCUMENT_DELETED",
        entityType: "DocumentAttachment",
        entityId: id,
        before: { relatedEntityType: attachment.entityType, relatedEntityId: attachment.entityId, originalName: attachment.originalName, sha256: attachment.sha256 }
      });
    });
    await removeDocumentFile(attachment.storageKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Document delete failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el documento." }, { status: 400 });
  }
}
