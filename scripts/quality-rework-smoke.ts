import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const customer = await prisma.customer.create({ data: { code: `CI-QC-CLI-${suffix}`, name: "CI Quality Customer" } });
  const originalOrder = await prisma.productionOrder.create({
    data: { folio: `CI-QC-OP-${suffix}`, customerId: customer.id, articleCode: `ART-${suffix}`, status: "IN_PROGRESS" }
  });
  const lot = await prisma.tanneryLot.create({
    data: {
      folio: `CI-QC-LOT-${suffix}`,
      productionOrderId: originalOrder.id,
      articleCode: `ART-${suffix}`,
      animalType: "BOVINO",
      status: "ON_HOLD",
      initialHides: 20,
      currentHides: 20,
      initialWeightKg: 200,
      currentWeightKg: 190
    }
  });
  const inspection = await prisma.qualityInspection.create({
    data: {
      folio: `CI-QC-${suffix}`,
      lotId: lot.id,
      status: "DRAFT",
      grade: "B",
      inspectorName: "CI Inspector",
      visualResult: "Requiere corrección"
    }
  });

  async function resolveRework(tag: string) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "QualityInspection" WHERE id = ${inspection.id} FOR UPDATE`;
      const current = await tx.qualityInspection.findUniqueOrThrow({ where: { id: inspection.id }, include: { lot: { include: { productionOrder: true } } } });
      if (current.status !== "DRAFT") return false;

      const op = await tx.productionOrder.create({
        data: {
          folio: `CI-RPK-${tag}-${suffix}`,
          customerId: current.lot.productionOrder?.customerId ?? null,
          articleCode: current.lot.articleCode,
          requestedHides: current.lot.currentHides,
          requestedWeightKg: current.lot.currentWeightKg,
          status: "RELEASED",
          notes: `Reproceso CI ${tag}`
        }
      });
      await tx.qualityInspection.update({ where: { id: inspection.id }, data: { status: "REWORK_REQUIRED", disposition: "REWORK" } });
      await tx.tanneryLot.update({ where: { id: lot.id }, data: { status: "IN_PROCESS", currentProcessCode: "REWORK", productionOrderId: op.id } });
      return true;
    }, { isolationLevel: "Serializable" });
  }

  try {
    const results = await Promise.allSettled([resolveRework("A"), resolveRework("B")]);
    const successes = results.filter(r => r.status === "fulfilled" && r.value === true).length;
    assert.equal(successes, 1, "Sólo una resolución concurrente debe crear reproceso");

    const afterInspection = await prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspection.id } });
    const afterLot = await prisma.tanneryLot.findUniqueOrThrow({ where: { id: lot.id } });
    const reworkOrders = await prisma.productionOrder.findMany({ where: { folio: { startsWith: "CI-RPK-", contains: suffix } } });

    assert.equal(afterInspection.status, "REWORK_REQUIRED");
    assert.equal(afterInspection.disposition, "REWORK");
    assert.equal(afterLot.status, "IN_PROCESS");
    assert.equal(afterLot.currentProcessCode, "REWORK");
    assert.equal(reworkOrders.length, 1, "Debe existir una sola OP de reproceso");
    assert.equal(afterLot.productionOrderId, reworkOrders[0].id, "El lote debe quedar ligado a la OP de reproceso");
    console.log("Quality rework smoke OK: resolución serializada y una sola OP de reproceso.");
  } finally {
    await prisma.qualityDefectFinding.deleteMany({ where: { inspectionId: inspection.id } });
    await prisma.qualityInspection.deleteMany({ where: { id: inspection.id } });
    await prisma.tanneryLot.deleteMany({ where: { id: lot.id } });
    await prisma.productionOrder.deleteMany({ where: { OR: [{ id: originalOrder.id }, { folio: { contains: suffix } }] } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
