import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testChemicalConcurrency(suffix: string) {
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { code: "QUI" } });
  const chemical = await prisma.chemicalProduct.create({
    data: { code: `CI-CHEM-${suffix}`, name: "CI Chemical", unit: "kg", minStock: 0 }
  });
  const lot = await prisma.chemicalLot.create({
    data: {
      chemicalId: chemical.id,
      warehouseId: warehouse.id,
      lotNumber: `CI-LOT-${suffix}`,
      initialQuantity: 100,
      currentQuantity: 100,
      unitCost: 1
    }
  });

  try {
    const results = await Promise.all([
      prisma.chemicalLot.updateMany({ where: { id: lot.id, currentQuantity: { gte: 80 } }, data: { currentQuantity: { decrement: 80 } } }),
      prisma.chemicalLot.updateMany({ where: { id: lot.id, currentQuantity: { gte: 80 } }, data: { currentQuantity: { decrement: 80 } } })
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1, "Sólo un consumo concurrente debe ganar");
    const after = await prisma.chemicalLot.findUniqueOrThrow({ where: { id: lot.id } });
    assert.equal(Number(after.currentQuantity), 20, "La existencia final debe ser 20");
  } finally {
    await prisma.chemicalLot.deleteMany({ where: { chemicalId: chemical.id } });
    await prisma.chemicalProduct.delete({ where: { id: chemical.id } });
  }
}

async function testReceivableConcurrency(suffix: string) {
  const customer = await prisma.customer.create({ data: { code: `CI-CLI-${suffix}`, name: "CI Customer" } });
  const receivable = await prisma.accountReceivable.create({
    data: { folio: `CI-CXC-${suffix}`, customerId: customer.id, total: 100, balance: 100 }
  });

  try {
    const results = await Promise.all([
      prisma.accountReceivable.updateMany({ where: { id: receivable.id, balance: { gte: 80 }, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, data: { balance: { decrement: 80 } } }),
      prisma.accountReceivable.updateMany({ where: { id: receivable.id, balance: { gte: 80 }, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, data: { balance: { decrement: 80 } } })
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1, "Sólo un pago concurrente debe ganar");
    const after = await prisma.accountReceivable.findUniqueOrThrow({ where: { id: receivable.id } });
    assert.equal(Number(after.balance), 20, "El saldo final debe ser 20");
  } finally {
    await prisma.accountReceivable.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

async function testMachineClaimConcurrency(suffix: string) {
  const machine = await prisma.machine.create({
    data: { code: `CI-MAQ-${suffix}`, name: "CI Machine", type: "Test", status: "AVAILABLE", active: true }
  });

  try {
    const results = await Promise.all([
      prisma.machine.updateMany({ where: { id: machine.id, active: true, status: "AVAILABLE" }, data: { status: "IN_USE" } }),
      prisma.machine.updateMany({ where: { id: machine.id, active: true, status: "AVAILABLE" }, data: { status: "IN_USE" } })
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1, "Sólo una asignación concurrente de máquina debe ganar");
    const after = await prisma.machine.findUniqueOrThrow({ where: { id: machine.id } });
    assert.equal(after.status, "IN_USE", "La máquina debe quedar tomada");
  } finally {
    await prisma.machine.delete({ where: { id: machine.id } });
  }
}

async function testMaintenanceMachineClaimConcurrency(suffix: string) {
  const machine = await prisma.machine.create({
    data: { code: `CI-MTO-MAQ-${suffix}`, name: "CI Maintenance Machine", type: "Test", status: "AVAILABLE", active: true }
  });
  const orders = await Promise.all([
    prisma.maintenanceWorkOrder.create({ data: { folio: `CI-MTO-A-${suffix}`, machineId: machine.id, type: "CORRECTIVE", priority: "HIGH", description: "Concurrent maintenance A" } }),
    prisma.maintenanceWorkOrder.create({ data: { folio: `CI-MTO-B-${suffix}`, machineId: machine.id, type: "CORRECTIVE", priority: "HIGH", description: "Concurrent maintenance B" } })
  ]);

  try {
    const claims = await Promise.all(orders.map(async order => {
      return prisma.$transaction(async tx => {
        const claimed = await tx.machine.updateMany({
          where: { id: machine.id, active: true, status: "AVAILABLE" },
          data: { status: "MAINTENANCE" }
        });
        if (claimed.count === 1) {
          await tx.maintenanceWorkOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
        }
        return claimed.count;
      });
    }));

    assert.equal(claims.reduce((sum, count) => sum + count, 0), 1, "Sólo una orden de mantenimiento debe tomar la máquina");
    const activeOrders = await prisma.maintenanceWorkOrder.count({ where: { machineId: machine.id, status: "IN_PROGRESS" } });
    assert.equal(activeOrders, 1, "Sólo una orden debe quedar en proceso");
  } finally {
    await prisma.maintenanceWorkOrder.deleteMany({ where: { machineId: machine.id } });
    await prisma.machine.delete({ where: { id: machine.id } });
  }
}

async function testMaintenancePartConcurrency(suffix: string) {
  const part = await prisma.maintenancePart.create({
    data: { code: `CI-REF-${suffix}`, name: "CI Spare Part", unit: "pz", currentStock: 10, unitCost: 25, active: true }
  });

  try {
    const results = await Promise.all([
      prisma.maintenancePart.updateMany({ where: { id: part.id, active: true, currentStock: { gte: 8 } }, data: { currentStock: { decrement: 8 } } }),
      prisma.maintenancePart.updateMany({ where: { id: part.id, active: true, currentStock: { gte: 8 } }, data: { currentStock: { decrement: 8 } } })
    ]);
    assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1, "Sólo un consumo concurrente de refacción debe ganar");
    const after = await prisma.maintenancePart.findUniqueOrThrow({ where: { id: part.id } });
    assert.equal(Number(after.currentStock), 2, "La existencia final de la refacción debe ser 2");
  } finally {
    await prisma.maintenancePart.delete({ where: { id: part.id } });
  }
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  await prisma.$queryRaw`SELECT 1`;
  await testChemicalConcurrency(suffix);
  await testReceivableConcurrency(suffix);
  await testMachineClaimConcurrency(suffix);
  await testMaintenanceMachineClaimConcurrency(suffix);
  await testMaintenancePartConcurrency(suffix);
  console.log("Integration smoke OK: PostgreSQL + concurrencia crítica + mantenimiento.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
