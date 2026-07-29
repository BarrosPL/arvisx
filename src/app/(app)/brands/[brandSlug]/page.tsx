import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { KeyRound, ListChecks } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { brandStatusTone } from "@/lib/brands/status";
import { RankingPanel, type RankingView } from "@/components/ranking-panel";
import { BrandAvatar } from "@/components/brand-avatar";
import { BrandAdvancedSettings } from "@/components/brand-advanced-settings";
import { TalkToJamileButton } from "@/components/talk-to-jamile-button";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandDetailPage({ params }: PageProps) {
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

  const [latestRanking, credentialsCount] = await Promise.all([
    prisma.rankingSnapshot.findFirst({
      where: { brandId: brand.id },
      orderBy: { computedAt: "desc" },
    }),
    prisma.adCredential.count({ where: { brandId: brand.id } }),
  ]);

  const rankingView: RankingView | null = latestRanking
    ? {
        verdict: latestRanking.verdict,
        computedAt: latestRanking.computedAt.toISOString(),
        recommendedActions: latestRanking.recommendedActionsJson as unknown as RankingView["recommendedActions"],
      }
    : null;

  const brandStatus = brandStatusTone(brand.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <BrandAvatar name={brand.name} seed={brand.id} size="lg" />
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{brand.name}</h1>
              <StatusBadge tone={brandStatus.tone} label={brandStatus.label} />
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {latestRanking
                ? `Última análise: ${latestRanking.computedAt.toLocaleString("pt-BR")}`
                : "Ainda sem análise"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            render={<Link href={`/brands/${brand.slug}/credentials`} />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            <KeyRound />
            {credentialsCount} conta{credentialsCount === 1 ? "" : "s"}
          </Button>
          <Button
            render={<Link href={`/brands/${brand.slug}/proposals`} />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            <ListChecks />
            Propostas
          </Button>
          <TalkToJamileButton />
        </div>
      </div>

      <RankingPanel brandId={brand.id} initial={rankingView} />

      <BrandAdvancedSettings
        initial={{
          id: brand.id,
          slug: brand.slug,
          name: brand.name,
          status: brand.status,
          priorityOrder: brand.priorityOrder,
          topicKeywords: brand.topicKeywords,
          excludedKeywords: brand.excludedKeywords,
        }}
        meta={{ slug: brand.slug, role: access.role }}
      />
    </div>
  );
}
