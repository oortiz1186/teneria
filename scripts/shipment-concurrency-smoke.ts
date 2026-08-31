import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const customer = await prisma.customer.create({ data: { code: `CI-SHIP-CLI-${suffix}`, name: "CI Shipment Customer" } });
  const product = await prisma.commercialProduct.create({
    data: { code: `CI-SHIP-PROD-${suffix}`, name: "CI Shipment Product", unit: "PIECE", basePrice: 10, taxRate: 16 }
  });
  const order = await prisma.salesOrder.create({
    data: {
      folio: `CI-PED-${suffix}`,
      customerId: customer.id,
      status: "READY",
      subtotal: 1000,
      tax: 160,
      total: 1160,
      items: { create: { productId: product.id, description: product.name, quantity: 100, unitPrice: 10, subtotal: 1000, tax: 160, total: 1160 } }
    }
  });
  const productionOrder = await prisma.productionOrder.create({
    data: {
      folio: `CI-OP-${suffix}`,
      customerId: customer.id,
      salesOrderId: order.id,
      articleCode: product.code,
      requestedHides: 100,
      status: "COMPLETED"
    }
  });
  const lot = await prisma.tanneryLot.create({
    data: {
      folio: `CI-LOT-SHIP-${suffix}`,
      productionOrderId: productionOrder.id,
      animalType: "BOVINO",
      status: "COMPLETED",
      initialHides: 100,
      currentHides: 100,
      initialWeightKg: 1000,
      currentWeightKg: 1000
    }
  });

  const attemptShipment = async (tag: string) => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${order.id} FOR UPDATE`;
    const currentOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    const orderItem = currentOrder.items.find(item => item.productId === product.id)!;
    const shipped = await tx.shipmentItem.aggregate({
      where: { productId: product.id, shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } } },
      _sum: { quantity: true }
    });
    const already = Number(shipped._sum.quantity ?? 0);
    const quantity = 60;
    if (already + quantity > Number(orderItem.quantity) + 0.000001) throw new Error("overdelivery blocked");

    const shipment = await tx.shipment.create({
      data: {
        folio: `CI-REM-${tag}-${suffix}`,
        salesOrderId: order.id,
        customerId: customer.id,
        status: "ISSUED",
        shippedAt: new Date(),
        items: { create: { productId: product.id, lotId: lot.id, quantity } }
      }
    });
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "PARTIALLY_SHIPPED" } });
    return shipment.id;
  }, { isolationLevel: "Serializable" });

  try {
    const results = await Promise.allSettled([attemptShipment("A"), attemptShipment("B")]);
    const fulfilled = results.filter(result => result.status === "fulfilled").length;
    const rejected = results.filter(result => result.status === "rejected").length;
    assert.equal(fulfilled, 1, "Sólo una remisión concurrente de 60 debe confirmarse para un pedido de 100");
    assert.equal(rejected, 1, "La segunda remisión concurrente debe bloquearse");

    const shipped = await prisma.shipmentItem.aggregate({
      where: { shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } } },
      _sum: { quantity: true }
    });
    assert.equal(Number(shipped._sum.quantity ?? 0), 60, "La cantidad acumulada no debe superar el pedido");
    const after = await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.status, "PARTIALLY_SHIPPED", "El pedido debe quedar parcialmente enviado");
    console.log("Shipment concurrency smoke OK: sobre-entrega concurrente bloqueada.");
  } finally {
    await prisma.shipmentItem.deleteMany({ where: { shipment: { salesOrderId: order.id } } });
    await prisma.shipment.deleteMany({ where: { salesOrderId: order.id } });
    await prisma.tanneryLot.delete({ where: { id: lot.id } });
    await prisma.productionOrder.delete({ where: { id: productionOrder.id } });
    await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });
    await prisma.salesOrder.delete({ where: { id: order.id } });
    await prisma.commercialProduct.delete({ where: { id: product.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
