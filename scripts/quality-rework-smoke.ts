import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const processes = await Promise.all([
    prisma.processCatalog.create({ data: { code: `CI-QC-P1-${suffix}`, name: "Curtido CI", sequence: 1001 } }),
    prisma.processCatalog.create({ data: { code: `CI-QC-P2-${suffix}`, name: "Teñido CI", sequence: 1002 } }),
    prisma.processCatalog.create({ data: { code: `CI-QC-P3-${suffix}`, name: "Acabado CI", sequence: 1003 } })
  ]);
  const route = await prisma.productionRoute.create({ data: { code: `CI-QC-R-${suffix}`, name: "Ruta CI" } });
  const steps: Array<{ id: string; routeId: string; processId: string; sequence: number }> = [];
  for (let i = 0; i < processes.length; i++) {
    const step = await prisma.productionRouteStep.create({ data: { routeId: route.id, processId: processes[i].id, sequence: i + 1 } });
    steps.push({ id: step.id, routeId: step.routeId, processId: step.processId, sequence: step.sequence });
  }
  const customer = await prisma.customer.create({ data: { code: `CI-QC-CLI-${suffix}`, name: "CI Quality Customer" } });
  const originalOrder = await prisma.productionOrder.create({
    data: { folio: `CI-QC-OP-${suffix}`, customerId: customer.id, articleCode: `ART-${suffix}`, routeId: route.id, status: "IN_PROGRESS" }
  });
  const lot = await prisma.tanneryLot.create({
    data: { folio: `CI-QC-LOT-${suffix}`, productionOrderId: originalOrder.id, articleCode: `ART-${suffix}`, animalType: "BOVINO", status: "ON_HOLD", initialHides: 20, currentHides: 20, initialWeightKg: 200, currentWeightKg: 190 }
  });
  const inspection = await prisma.qualityInspection.create({
    data: { folio: `CI-QC-${suffix}`, lotId: lot.id, status: "DRAFT", grade: "B", inspectorName: "CI Inspector", visualResult: "Requiere corrección" }
  });

  async function resolveRework(tag: string) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "QualityInspection" WHERE id = ${inspection.id} FOR UPDATE`;
      const current = await tx.qualityInspection.findUniqueOrThrow({
        where: { id: inspection.id },
        include: { lot: { include: { productionOrder: { include: { route: { include: { steps: { include: { process: true }, orderBy: { sequence: "asc" } } } } } } } } }
      });
      if (current.status !== "DRAFT") return false;
      const routeSteps = current.lot.productionOrder?.route?.steps ?? [];
      const startStep = routeSteps.find(step => step.id === steps[1].id);
      assert.ok(startStep);
      const pendingSteps = routeSteps.filter(step => step.sequence >= startStep.sequence);

      const op = await tx.productionOrder.create({
        data: { folio: `CI-RPK-${tag}-${suffix}`, customerId: current.lot.productionOrder?.customerId ?? null, routeId: route.id, articleCode: current.lot.articleCode, requestedHides: current.lot.currentHides, requestedWeightKg: current.lot.currentWeightKg, status: "RELEASED", notes: `Reproceso CI desde ${startStep.process.name}` }
      });
      await tx.lotProcess.createMany({ data: pendingSteps.map(step => ({ lotId: lot.id, processId: step.processId, routeStepId: step.id, productionOrderId: op.id, status: "PENDING" as const })) });
      await tx.qualityInspection.update({ where: { id: inspection.id }, data: { status: "REWORK_REQUIRED", disposition: "REWORK" } });
      await tx.tanneryLot.update({ where: { id: lot.id }, data: { status: "IN_PROCESS", currentProcessCode: `REWORK:${startStep.process.code}`, productionOrderId: op.id } });
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
    assert.equal(reworkOrders.length, 1);
    const pending = await prisma.lotProcess.findMany({ where: { productionOrderId: reworkOrders[0].id }, include: { routeStep: true }, orderBy: { routeStep: { sequence: "asc" } } });

    assert.equal(afterInspection.status, "REWORK_REQUIRED");
    assert.equal(afterLot.status, "IN_PROCESS");
    assert.equal(afterLot.productionOrderId, reworkOrders[0].id);
    assert.equal(pending.length, 2, "Reiniciar en la segunda etapa debe crear sólo esa etapa y la posterior");
    assert.deepEqual(pending.map(p => p.processId), [processes[1].id, processes[2].id]);
    console.log("Quality rework smoke OK: reproceso serializado y ruta regenerada desde la etapa seleccionada.");
  } finally {
    await prisma.lotProcess.deleteMany({ where: { lotId: lot.id } });
    await prisma.qualityInspection.deleteMany({ where: { id: inspection.id } });
    await prisma.tanneryLot.deleteMany({ where: { id: lot.id } });
    await prisma.productionOrder.deleteMany({ where: { OR: [{ id: originalOrder.id }, { folio: { contains: suffix } }] } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.productionRouteStep.deleteMany({ where: { routeId: route.id } });
    await prisma.productionRoute.delete({ where: { id: route.id } });
    await prisma.processCatalog.deleteMany({ where: { id: { in: processes.map(p => p.id) } } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
