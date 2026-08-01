import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redactConnection } from "@/lib/ads/credentials";
import { ConnectionsManager, type ConnectionItem } from "@/components/connections-manager";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { autoProvisionAccountsForConnection } from "@/lib/accounts/autoProvision";
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

  const existingConnections = await prisma.providerConnection.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });

  // Toda conta descoberta vira uma conta do sistema automaticamente - nao ha passo
  // manual de atribuicao.
  //
  // Logo depois de conectar (?connected=1) ESPERA a descoberta terminar: era aqui o
  // bug que fazia parecer que nao tinha funcionado - a descoberta rodava em segundo
  // plano e a pagina renderizava antes, mostrando zero conta. Nas visitas normais
  // segue em segundo plano (nao trava a tela), ja que ai e so pra pegar conta nova
  // que apareceu depois.
  let discoveryError: string | null = null;
  if (connected) {
    const results = await Promise.all(
      existingConnections.map((connection) =>
        autoProvisionAccountsForConnection(connection.id).catch((error) => ({
          createdAccounts: [],
          skipped: 0,
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido ao descobrir contas",
        }))
      )
    );
    discoveryError = results.find((result) => result.errorMessage)?.errorMessage ?? null;
  } else {
    for (const connection of existingConnections) {
      void autoProvisionAccountsForConnection(connection.id).catch((error) => {
        console.error("[auto-provision] falhou em segundo plano a partir de /connections:", error);
      });
    }
  }

  const connections = await prisma.providerConnection.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { assignments: true } } },
  });

  const items: ConnectionItem[] = connections.map((connection) => {
    const safe = redactConnection(connection);
    return {
      id: safe.id,
      platform: safe.platform,
      label: safe.label,
      status: safe.status,
      lastCheckedAt: safe.lastCheckedAt ? safe.lastCheckedAt.toISOString() : null,
      lastError: safe.lastError,
      accountsCount: connection._count.assignments,
    };
  });

  const totalAccounts = items.reduce((sum, item) => sum + item.accountsCount, 0);
  const oauthError = connected ? undefined : oauthErrorParam;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Conexões"
        description="Logins Meta e Google Ads conectados por você. Todas as contas de anúncio visíveis em cada login entram no sistema automaticamente."
      />
      {connected && !discoveryError ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          Conectado com sucesso — {totalAccounts} conta(s) de anúncio já no sistema.
        </div>
      ) : null}
      <ConnectionsManager
        initialConnections={items}
        metaConfigured={isMetaOAuthConfigured()}
        googleConfigured={isGoogleOAuthConfigured()}
        metaRedirectUri={getMetaRedirectUri()}
        googleRedirectUri={getGoogleRedirectUri()}
        oauthError={discoveryError ?? oauthError}
      />
    </div>
  );
}
