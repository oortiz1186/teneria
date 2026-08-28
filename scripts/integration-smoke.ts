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

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  await prisma.$queryRaw`SELECT 1`;
  await testChemicalConcurrency(suffix);
  await testReceivableConcurrency(suffix);
  await testMachineClaimConcurrency(suffix);
  console.log("Integration smoke OK: PostgreSQL + concurrencia crítica.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
