import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const customer = await prisma.customer.create({ data: { code: `CI-FIN-${suffix}`, name: "CI Finance Customer" } });
  const receivable = await prisma.accountReceivable.create({ data: { folio: `CI-CXC-REV-${suffix}`, customerId: customer.id, total: 100, balance: 40, status: "PARTIALLY_PAID" } });
  const payment = await prisma.payment.create({ data: { folio: `CI-COB-${suffix}`, direction: "INCOME", method: "TRANSFER", amount: 60, reference: "CI reversal" } });
  await prisma.paymentApplication.create({ data: { paymentId: payment.id, receivableId: receivable.id, amount: 60 } });

  try {
    const reverse = async () => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      const currentPayment = await tx.payment.findUnique({ where: { id: payment.id }, include: { applications: true } });
      if (!currentPayment || currentPayment.applications.length !== 1) return false;
      const app = currentPayment.applications[0];
      if (!app.receivableId) return false;
      await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id = ${app.receivableId} FOR UPDATE`;
      const before = await tx.accountReceivable.findUniqueOrThrow({ where: { id: app.receivableId } });
      const newBalance = Math.min(Number(before.total), Number(before.balance) + Number(app.amount));
      await tx.accountReceivable.update({ where: { id: before.id }, data: { balance: newBalance, status: newBalance >= Number(before.total) - 0.0001 ? "OPEN" : "PARTIALLY_PAID" } });
      await tx.payment.delete({ where: { id: currentPayment.id } });
      return true;
    }, { isolationLevel: "Serializable" }).catch(() => false);

    const results = await Promise.all([reverse(), reverse()]);
    assert.equal(results.filter(Boolean).length, 1, "Sólo una reversa concurrente debe ganar");

    const after = await prisma.accountReceivable.findUniqueOrThrow({ where: { id: receivable.id } });
    assert.equal(Number(after.balance), 100, "El saldo debe regresar exactamente a 100");
    assert.equal(after.status, "OPEN", "La CxC debe regresar a OPEN");
    assert.equal(await prisma.payment.count({ where: { id: payment.id } }), 0, "El pago reversado debe quedar eliminado del ledger activo");
    assert.equal(await prisma.paymentApplication.count({ where: { paymentId: payment.id } }), 0, "La aplicación debe eliminarse por cascada");

    console.log("Finance reversal smoke OK: reversa concurrente + saldo restaurado.");
  } finally {
    await prisma.paymentApplication.deleteMany({ where: { receivableId: receivable.id } });
    await prisma.payment.deleteMany({ where: { applications: { some: { receivableId: receivable.id } } } });
    await prisma.accountReceivable.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
