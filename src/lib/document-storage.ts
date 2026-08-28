import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/xml",
  "text/xml"
]);

export function documentStorageRoot() {
  return process.env.DOCUMENT_STORAGE_PATH || path.join(process.cwd(), ".data", "documents");
}

export function documentMaxBytes() {
  const configured = Number(process.env.DOCUMENT_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

export function assertAllowedDocument(file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de archivo no permitido. Usa JPG, PNG, WEBP, PDF o XML.");
  }
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > documentMaxBytes()) {
    throw new Error(`El archivo excede el máximo permitido de ${Math.round(documentMaxBytes() / 1024 / 1024)} MB.`);
  }
}

function safeExtension(name: string) {
  const ext = path.extname(name).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export async function saveDocumentFile(file: File) {
  assertAllowedDocument(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storageKey = path.posix.join(year, month, `${randomUUID()}${safeExtension(file.name)}`);
  const absolutePath = path.join(documentStorageRoot(), ...storageKey.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" });
  return { storageKey, sha256, sizeBytes: bytes.byteLength };
}

export async function loadDocumentFile(storageKey: string) {
  const normalized = path.posix.normalize(storageKey);
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) throw new Error("Ruta de documento inválida.");
  return readFile(path.join(documentStorageRoot(), ...normalized.split("/")));
}

export async function removeDocumentFile(storageKey: string) {
  const normalized = path.posix.normalize(storageKey);
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) throw new Error("Ruta de documento inválida.");
  await unlink(path.join(documentStorageRoot(), ...normalized.split("/"))).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}
