import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BioPagesManager } from "@/components/links/bio-pages-manager";

/**
 * F7 (spec-gestor-trafego não - SPEC_Funcionalidades.md) - primeiro módulo do produto
 * de conteúdo social novo, separado do gestor de tráfego. Ver plano em
 * C:\Users\lcsin\.claude\plans\hidden-zooming-cat.md.
 */
export default async function LinksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Links"
        description="Página pública com todos os seus links e captura de leads — visitada em /p/seu-slug."
      />
      <BioPagesManager />
    </div>
  );
}
