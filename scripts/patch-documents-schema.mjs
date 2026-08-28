import fs from 'node:fs';
const path = 'prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');
if (!schema.includes('model DocumentAttachment {')) {
  schema += `\n\nmodel DocumentAttachment {\n  id String @id @default(cuid())\n  entityType String\n  entityId String\n  category String?\n  originalName String\n  mimeType String\n  sizeBytes Int\n  storageProvider String @default(\"LOCAL\")\n  storageKey String @unique\n  sha256 String\n  uploadedById String?\n  uploadedByEmail String?\n  createdAt DateTime @default(now())\n  deletedAt DateTime?\n  @@index([entityType,entityId,createdAt])\n  @@index([sha256])\n}\n`;
  fs.writeFileSync(path, schema);
  console.log('DocumentAttachment appended');
} else {
  console.log('DocumentAttachment already present');
}
