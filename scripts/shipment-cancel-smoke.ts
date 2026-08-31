import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const customer = await prisma.customer.create({ data: { code: `CI-CANCEL-CLI-${suffix}`, name: "CI Cancel Customer" } });
  const product = await prisma.commercialProduct.create({
    data: { code: `CI-CANCEL-PROD-${suffix}`, name: "CI Cancel Product", unit: "PIECE", basePrice: 10, taxRate: 16 }
  });
  const order = await prisma.salesOrder.create({
    data: {
      folio: `CI-CANCEL-PED-${suffix}`,
      customerId: customer.id,
      status: "PARTIALLY_SHIPPED",
      subtotal: 1000,
      tax: 160,
      total: 1160,
      items: { create: { productId: product.id, description: product.name, quantity: 100, unitPrice: 10, subtotal: 1000, tax: 160, total: 1160 } }
    }
  });
  const shipment = await prisma.shipment.create({
    data: {
      folio: `CI-CANCEL-REM-${suffix}`,
      salesOrderId: order.id,
      customerId: customer.id,
      status: "ISSUED",
      shippedAt: new Date(),
      items: { create: { productId: product.id, quantity: 60 } }
    }
  });

  const cancelOnce = async () => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${order.id} FOR UPDATE`;
    const current = await tx.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    if (current.status === "CANCELLED") throw new Error("already-cancelled");
    await tx.shipment.update({ where: { id: shipment.id }, data: { status: "CANCELLED", notes: "CI cancellation" } });

    const totals = await tx.shipmentItem.groupBy({
      by: ["productId"],
      where: { shipment: { salesOrderId: order.id, status: { not: "CANCELLED" } } },
      _sum: { quantity: true }
    });
    const anyShipped = totals.some(row => Number(row._sum.quantity ?? 0) > 0);
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: anyShipped ? "PARTIALLY_SHIPPED" : "CONFIRMED" } });
    return true;
  }, { isolationLevel: "Serializable" });

  try {
    const results = await Promise.allSettled([cancelOnce(), cancelOnce()]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1, "Sólo una cancelación concurrente debe confirmarse");
    assert.equal(results.filter(result => result.status === "rejected").length, 1, "La segunda cancelación debe rechazarse");

    const finalShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    const finalOrder = await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(finalShipment.status, "CANCELLED", "La remisión debe quedar cancelada");
    assert.equal(finalOrder.status, "CONFIRMED", "Sin remisiones activas ni OP, el pedido debe regresar a CONFIRMED");

    console.log("Shipment cancellation smoke OK: cancelación concurrente serializada y pedido recalculado.");
  } finally {
    await prisma.shipmentItem.deleteMany({ where: { shipmentId: shipment.id } });
    await prisma.shipment.deleteMany({ where: { id: shipment.id } });
    await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });
    await prisma.salesOrder.deleteMany({ where: { id: order.id } });
    await prisma.commercialProduct.deleteMany({ where: { id: product.id } });
    await prisma.customer.deleteMany({ where: { id: customer.id } });
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
