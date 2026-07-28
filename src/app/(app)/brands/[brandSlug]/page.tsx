import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { BRAND_STATUS_LABEL, BRAND_STATUS_VARIANT } from "@/lib/brands/status";
import { RankingPanel, type RankingView } from "@/components/ranking-panel";
import { BrandAvatar } from "@/components/brand-avatar";
import { BrandAdvancedSettings } from "@/components/brand-advanced-settings";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <BrandAvatar name={brand.name} seed={brand.id} size="lg" />
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{brand.name}</h1>
            <Badge variant={BRAND_STATUS_VARIANT[brand.status] ?? "outline"}>
              {BRAND_STATUS_LABEL[brand.status] ?? brand.status}
            </Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            slug: {brand.slug} · seu papel: {access.role}
          </p>
        </div>
        <Link
          href={`/brands/${brand.slug}/credentials`}
          className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        >
          <KeyRound className="size-4" />
          {credentialsCount} conta{credentialsCount === 1 ? "" : "s"}
        </Link>
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
      />
    </div>
  );
}
