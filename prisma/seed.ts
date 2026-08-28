import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles = [["ADMIN","Administrador"],["PRODUCTION","Producción"],["WAREHOUSE","Almacén"],["QUALITY","Calidad"],["SALES","Ventas"],["PURCHASING","Compras"],["FINANCE","Administración / Finanzas"],["MAINTENANCE","Mantenimiento"]];
  for (const [code,name] of roles) await prisma.role.upsert({ where:{code}, update:{name}, create:{code,name} });

  const bootstrapEmail = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (bootstrapEmail && bootstrapPassword) {
    if (bootstrapPassword.length < 12) throw new Error("AUTH_BOOTSTRAP_PASSWORD debe tener al menos 12 caracteres.");
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const existingAdmin = await prisma.user.findUnique({ where: { email: bootstrapEmail } });
    let admin;

    if (existingAdmin) {
      admin = await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name: process.env.AUTH_BOOTSTRAP_NAME || existingAdmin.name,
          status: "ACTIVE",
          ...(existingAdmin.passwordHash ? {} : { passwordHash: await bcrypt.hash(bootstrapPassword, 12) })
        }
      });
    } else {
      admin = await prisma.user.create({
        data: {
          email: bootstrapEmail,
          name: process.env.AUTH_BOOTSTRAP_NAME || "Administrador",
          status: "ACTIVE",
          passwordHash: await bcrypt.hash(bootstrapPassword, 12)
        }
      });
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id }
    });
  }

  const processes = [["RECEPTION","Recepción",10],["SOAKING","Remojo",20],["LIMING","Pelambre",30],["FLESHING","Descarne",40],["SPLITTING","Dividido",50],["DELIMING","Desencalado",60],["PICKLING","Piquelado",70],["TANNING","Curtido",80],["SAMMYING","Escurrido",90],["SHAVING","Rebajado",100],["RETANNING","Recurtido",110],["DYEING","Teñido",120],["FATLIQUORING","Engrase",130],["DRYING","Secado",140],["FINISHING","Acabado",150],["QUALITY","Clasificación / Calidad",160],["FINISHED_WAREHOUSE","Almacén de terminado",170]];
  for (const [code,name,sequence] of processes) await prisma.processCatalog.upsert({ where:{code:String(code)}, update:{name:String(name),sequence:Number(sequence)}, create:{code:String(code),name:String(name),sequence:Number(sequence)} });

  for (const [code,name] of [["MP","Materia prima"],["WIP","Producción / proceso"],["QUI","Químicos"],["PT","Producto terminado"]]) await prisma.warehouse.upsert({ where:{code}, update:{name}, create:{code,name} });

  const machines = [["BOM-01","Bombo 01","Bombo",2500],["BOM-02","Bombo 02","Bombo",2500],["BOM-03","Bombo 03","Bombo",3500],["DESC-01","Descarnadora 01","Descarnadora",1500],["DIV-01","Divididora 01","Divididora",1200],["REB-01","Rebajadora 01","Rebajadora",1200]];
  for (const [code,name,type,capacityKg] of machines) await prisma.machine.upsert({ where:{code:String(code)}, update:{name:String(name),type:String(type),capacityKg:Number(capacityKg)}, create:{code:String(code),name:String(name),type:String(type),capacityKg:Number(capacityKg)} });

  const route = await prisma.productionRoute.upsert({ where: { code: "FULL-CYCLE" }, update: { name: "Ciclo completo estándar", active: true }, create: { code: "FULL-CYCLE", name: "Ciclo completo estándar", description: "Ruta inicial configurable desde remojo hasta calidad." } });
  const routeCodes = ["SOAKING","LIMING","FLESHING","SPLITTING","DELIMING","PICKLING","TANNING","SAMMYING","SHAVING","RETANNING","DYEING","FATLIQUORING","DRYING","FINISHING","QUALITY"];
  for (let i = 0; i < routeCodes.length; i++) {
    const process = await prisma.processCatalog.findUniqueOrThrow({ where: { code: routeCodes[i] } });
    const sequence = (i + 1) * 10;
    await prisma.productionRouteStep.upsert({
      where: { routeId_sequence: { routeId: route.id, sequence } },
      update: { processId: process.id, required: true },
      create: { routeId: route.id, processId: process.id, sequence }
    });
  }

  const defects = [
    ["SCAR","Cicatriz","Superficie","MEDIUM"],
    ["HOLE","Agujero / perforación","Estructural","HIGH"],
    ["WRINKLE","Arruga","Superficie","MEDIUM"],
    ["COLOR","Variación de color","Acabado","MEDIUM"],
    ["THICK","Espesor fuera de especificación","Dimensional","HIGH"],
    ["GRAIN","Daño de flor","Superficie","HIGH"],
    ["PEEL","Desprendimiento de acabado","Acabado","CRITICAL"],
    ["STAIN","Mancha","Superficie","MEDIUM"],
    ["SOFT","Suavidad fuera de especificación","Tacto","LOW"],
    ["CRACK","Cuarteadura","Estructural","CRITICAL"]
  ];
  for (const [code,name,category,defaultSeverity] of defects) {
    await prisma.qualityDefectCatalog.upsert({
      where: { code: String(code) },
      update: { name: String(name), category: String(category), defaultSeverity: defaultSeverity as any, active: true },
      create: { code: String(code), name: String(name), category: String(category), defaultSeverity: defaultSeverity as any }
    });
  }
}

main().then(async()=>prisma.$disconnect()).catch(async(e)=>{ console.error(e); await prisma.$disconnect(); process.exit(1); });