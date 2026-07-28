import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyFunnelStage } from "@/lib/ranking/funnel";
import { CredentialsManager, type CredentialItem, type AdRowView } from "@/components/credentials-manager";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandCredentialsPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    notFound();
  }

  const access = await prisma.brandAccess.findUnique({
    where: { userId_brandId: { userId: session.user.id, brandId: brand.id } },
  });
  if (!access) {
    notFound();
  }

  const [credentials, snapshots] = await Promise.all([
    prisma.adCredential.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "asc" },
      include: { providerConnection: { select: { label: true } } },
    }),
    // So a coleta mais recente por (credencial, anuncio) - mesmo padrao ja usado em
    // ranking/compute.ts, dashboard/page.tsx e agent/tools/getMetrics.ts.
    prisma.adMetricSnapshot.findMany({
      where: { brandId: brand.id, collectionState: "OK" },
      orderBy: { collectedAt: "desc" },
      distinct: ["credentialId", "platformAdId"],
    }),
  ]);

  const items: CredentialItem[] = credentials.map((credential) => ({
    id: credential.id,
    platform: credential.platform,
    externalAccountId: credential.externalAccountId,
    loginCustomerId: credential.loginCustomerId,
    label: credential.label,
    status: credential.status,
    lastCheckedAt: credential.lastCheckedAt ? credential.lastCheckedAt.toISOString() : null,
    lastError: credential.lastError,
    connectionLabel: credential.providerConnection.label,
  }));

  const adsByCredential: Record<string, AdRowView[]> = {};
  for (const snapshot of snapshots) {
    const row: AdRowView = {
      platformAdId: snapshot.platformAdId,
      adName: snapshot.adName,
      adStatus: snapshot.adStatus,
      campaignName: snapshot.campaignName,
      funnelStage: classifyFunnelStage(snapshot.campaignName),
      reach: snapshot.reach,
      impressions: snapshot.impressions,
      frequency: snapshot.frequency ? Number(snapshot.frequency) : null,
      cpm: snapshot.cpm ? Number(snapshot.cpm) : null,
      clicks: snapshot.clicks,
      ctr: Number(snapshot.ctr),
      cpc: Number(snapshot.cpc),
      spend: Number(snapshot.spend),
      conversions: snapshot.conversions,
      cpl: snapshot.cpl ? Number(snapshot.cpl) : null,
      cpa: snapshot.cpa ? Number(snapshot.cpa) : null,
      collectedAt: snapshot.collectedAt.toISOString(),
    };
    (adsByCredential[snapshot.credentialId] ??= []).push(row);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credenciais — {brand.name}</h1>
        <p className="text-sm text-muted-foreground">
          Contas de Meta Ads e Google Ads atribuídas a esta marca. Cada conta pertence a uma única
          marca — nunca compartilhe a mesma conta entre marcas.
        </p>
      </div>
      <CredentialsManager brandId={brand.id} initialCredentials={items} adsByCredential={adsByCredential} />
    </div>
  );
}
