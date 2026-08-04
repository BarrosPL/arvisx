import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { BioBlockRenderer } from "@/components/bio/blocks";
import { ConsentBanner } from "@/components/bio/consent-banner";
import { PageViewTracker } from "@/components/bio/tracking";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const bioPages = await prisma.bioPage.findMany({ where: { isPublished: true }, select: { slug: true } });
  return bioPages.map((bioPage) => ({ slug: bioPage.slug }));
}

async function getPublishedBioPage(slug: string) {
  const bioPage = await prisma.bioPage.findUnique({
    where: { slug, isPublished: true },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  if (!bioPage) return null;

  const now = new Date();
  const visibleBlocks = bioPage.blocks.filter((block) => {
    if (!block.isActive) return false;
    if (block.scheduleFrom && block.scheduleFrom > now) return false;
    if (block.scheduleTo && block.scheduleTo < now) return false;
    return true;
  });

  return { ...bioPage, blocks: visibleBlocks };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const bioPage = await getPublishedBioPage(slug);
  if (!bioPage) return {};

  const seo = (bioPage.seo as { title?: string; description?: string } | null) ?? null;
  return {
    title: seo?.title ?? bioPage.title,
    description: seo?.description ?? bioPage.headline ?? undefined,
  };
}

export default async function PublicBioPage({ params }: PageProps) {
  const { slug } = await params;
  const bioPage = await getPublishedBioPage(slug);
  if (!bioPage) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-6 px-4 py-10">
      {bioPage.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bioPage.avatarUrl}
          alt={bioPage.title}
          width={96}
          height={96}
          fetchPriority="high"
          className="size-24 rounded-full object-cover"
        />
      ) : null}
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-semibold">{bioPage.title}</h1>
        {bioPage.headline ? <p className="text-sm text-muted-foreground">{bioPage.headline}</p> : null}
        {bioPage.bio ? <p className="text-sm text-muted-foreground">{bioPage.bio}</p> : null}
      </div>
      <div className="flex w-full flex-col gap-3">
        {bioPage.blocks.map((block) => (
          <BioBlockRenderer key={block.id} block={block} />
        ))}
      </div>
      <ConsentBanner />
      <PageViewTracker bioPageId={bioPage.id} />
    </main>
  );
}
