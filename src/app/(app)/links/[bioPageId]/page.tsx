import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { BioPageEditor } from "@/components/links/bio-page-editor";

interface PageProps {
  params: Promise<{ bioPageId: string }>;
}

export default async function BioPageEditorPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const { bioPageId } = await params;

  const bioPage = await prisma.bioPage.findUnique({ where: { id: bioPageId } });
  if (!bioPage) notFound();

  const brand = await prisma.brand.findUnique({ where: { id: bioPage.brandId } });
  if (!brand || brand.ownerUserId !== session.user.id) notFound();

  const blocks = await prisma.bioBlock.findMany({ where: { bioPageId }, orderBy: { position: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={bioPage.title} description={`/p/${bioPage.slug}`} />
      <BioPageEditor bioPage={bioPage} initialBlocks={blocks} />
    </div>
  );
}
