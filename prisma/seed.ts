import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles = [
    ["ADMIN", "Administrador"],
    ["PRODUCTION", "Producción"],
    ["WAREHOUSE", "Almacén"],
    ["QUALITY", "Calidad"],
    ["SALES", "Ventas"],
    ["PURCHASING", "Compras"],
    ["FINANCE", "Administración / Finanzas"]
  ];

  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name }
    });
  }

  const processes = [
    ["RECEPTION", "Recepción", 10],
    ["SOAKING", "Remojo", 20],
    ["LIMING", "Pelambre", 30],
    ["FLESHING", "Descarne", 40],
    ["SPLITTING", "Dividido", 50],
    ["DELIMING", "Desencalado", 60],
    ["PICKLING", "Piquelado", 70],
    ["TANNING", "Curtido", 80],
    ["SAMMYING", "Escurrido", 90],
    ["SHAVING", "Rebajado", 100],
    ["RETANNING", "Recurtido", 110],
    ["DYEING", "Teñido", 120],
    ["FATLIQUORING", "Engrase", 130],
    ["DRYING", "Secado", 140],
    ["FINISHING", "Acabado", 150],
    ["QUALITY", "Clasificación / Calidad", 160],
    ["FINISHED_WAREHOUSE", "Almacén de terminado", 170]
  ];

  for (const [code, name, sequence] of processes) {
    await prisma.processCatalog.upsert({
      where: { code: String(code) },
      update: { name: String(name), sequence: Number(sequence) },
      create: { code: String(code), name: String(name), sequence: Number(sequence) }
    });
  }

  await prisma.warehouse.upsert({
    where: { code: "MP" },
    update: {},
    create: { code: "MP", name: "Materia prima" }
  });

  await prisma.warehouse.upsert({
    where: { code: "PT" },
    update: {},
    create: { code: "PT", name: "Producto terminado" }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
