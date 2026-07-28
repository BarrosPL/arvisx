import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redactConnection } from "@/lib/ads/credentials";
import { ConnectionsManager, type ConnectionItem } from "@/components/connections-manager";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { autoProvisionBrandsForConnection } from "@/lib/brands/autoProvision";

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
  // pula contas que ja tem credencial. Best-effort: nao trava a pagina se falhar.
  const existingConnections = await prisma.providerConnection.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  await Promise.all(
    existingConnections.map((connection) =>
      autoProvisionBrandsForConnection(connection.id).catch((error) => {
        console.error("[auto-provision] falhou no carregamento de /connections:", error);
      })
    )
  );

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conexões</h1>
        <p className="text-sm text-muted-foreground">
          Logins Meta e Google Ads conectados por você. Cada conta descoberta já vira sua própria
          marca automaticamente — mova pra outra marca abaixo se quiser consolidar.
        </p>
      </div>
      {connected ? (
        <p className="text-sm text-foreground">Conectado com sucesso — suas contas já viraram marcas.</p>
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
