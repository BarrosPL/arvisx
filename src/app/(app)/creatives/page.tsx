import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CreativeLibraryManager } from "@/components/creative-library-manager";

/**
 * Banco de criativos por produto/gancho (spec-gestor-trafego-ia.md secao 3) - so
 * catalogo por enquanto (decisao do Renan em 2026-08-04), sem ligacao com o upload de
 * criativo de NEW_CAMPAIGN/NEW_FUNNEL. Objetivo e so registrar o que ja existe e
 * mostrar visualmente onde falta cobertura Fria/Morna/Quente por gancho.
 */
export default async function CreativesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const credentials = await prisma.adCredential.findMany({
    where: { providerConnection: { userId: session.user.id } },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, externalAccountId: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Banco de Criativos"
        description="Organize os criativos existentes por produto e gancho — a JAMILE usa isso pra apontar onde falta cobertura Fria/Morna/Quente."
      />
      <CreativeLibraryManager
        credentials={credentials.map((credential) => ({
          id: credential.id,
          name: credential.label ?? credential.externalAccountId,
        }))}
      />
    </div>
  );
}
