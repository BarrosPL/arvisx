import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BrandManager } from "@/components/content/brand-manager";

export default async function ContentBrandPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Gerenciar Marcas" description="Gerencie suas marcas e informações de perfil" />
      <BrandManager />
    </div>
  );
}
