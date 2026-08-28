import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LotQrResolverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lot = await prisma.tanneryLot.findUnique({ where: { qrToken: token }, select: { id: true } });
  if (!lot) notFound();
  redirect(`/lotes/${lot.id}`);
}
