import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PublicAdLibrarySearch } from "@/components/public-ad-library-search";
import { PageHeader } from "@/components/page-header";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandLibraryPage({ params }: PageProps) {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Biblioteca — ${brand.name}`}
        description="Pesquise o que a concorrência/mercado está anunciando de verdade sobre um tema, pra usar como referência de criativo e mensagem. A JAMILE também consulta essa biblioteca sozinha antes de sugerir ajustes de criativo ou novas campanhas."
      />
      <PublicAdLibrarySearch brandId={brand.id} />
    </div>
  );
}
