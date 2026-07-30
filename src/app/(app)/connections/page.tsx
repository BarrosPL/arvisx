import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redactConnection } from "@/lib/ads/credentials";
import { ConnectionsManager, type ConnectionItem } from "@/components/connections-manager";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { autoProvisionBrandsForConnection } from "@/lib/brands/autoProvision";
import { PageHeader } from "@/components/page-header";
import { CheckCircle2 } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ oauth_error?: string; connected?: string }>;
}

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const { oauth_error: oauthErrorParam, connected } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Contas descobertas ja viram marca propria automaticamente - roda aqui de novo
  // (alem do callback OAuth) pra cobrir contas que apareceram depois do login inicial
  // (ex: acesso a mais uma conta de anuncio na mesma Business Manager). Idempotente -
  // pula contas que ja tem credencial.
  //
  // FIRE-AND-FORGET de proposito: isto faz chamada AO VIVO ao Meta/Google pra descobrir
  // contas, e antes era esperado (await) antes de renderizar - com dezenas de contas a
  // pagina simplesmente nao abria. Agora dispara em segundo plano e a tela renderiza na
  // hora; contas novas aparecem no proximo carregamento. Mesmo padrao ja usado no
  // runBestEffortSync dentro do proprio autoProvision.
  const existingConnections = await prisma.providerConnection.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  for (const connection of existingConnections) {
    void autoProvisionBrandsForConnection(connection.id).catch((error) => {
      console.error("[auto-provision] falhou em segundo plano a partir de /connections:", error);
    });
  }

  const [connections, brandAccess] = await Promise.all([
    prisma.providerConnection.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { assignments: true } } },
    }),
    prisma.brandAccess.findMany({
      where: { userId: session.user.id, role: { in: ["OWNER", "MANAGER"] } },
      include: { brand: { select: { id: true, name: true } } },
      orderBy: { brand: { priorityOrder: "asc" } },
    }),
  ]);

  const items: ConnectionItem[] = connections.map((connection) => {
    const safe = redactConnection(connection);
    return {
      id: safe.id,
      platform: safe.platform,
      label: safe.label,
      status: safe.status,
      lastCheckedAt: safe.lastCheckedAt ? safe.lastCheckedAt.toISOString() : null,
      lastError: safe.lastError,
      assignmentsCount: connection._count.assignments,
    };
  });

  const brands = brandAccess.map((access) => ({ id: access.brand.id, name: access.brand.name }));

  const oauthError = connected ? undefined : oauthErrorParam;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Conexões"
        description="Logins Meta e Google Ads conectados por você. Cada conta descoberta já vira sua própria marca automaticamente."
      />
      {connected ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          Conectado com sucesso — suas contas já viraram marcas.
        </div>
      ) : null}
      <ConnectionsManager
        initialConnections={items}
        brands={brands}
        metaConfigured={isMetaOAuthConfigured()}
        googleConfigured={isGoogleOAuthConfigured()}
        metaRedirectUri={getMetaRedirectUri()}
        googleRedirectUri={getGoogleRedirectUri()}
        oauthError={oauthError}
      />
    </div>
  );
}
