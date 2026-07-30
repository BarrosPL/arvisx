import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAttentionItems } from "@/lib/notifications";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { JamileProvider } from "@/components/jamile-launcher";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const [brands, notifications] = await Promise.all([
    prisma.brand.findMany({
      where: { brandAccess: { some: { userId: session.user.id } } },
      orderBy: { priorityOrder: "asc" },
      select: { id: true, slug: true, name: true, status: true },
    }),
    getAttentionItems(session.user.id),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <SidebarProvider>
      {/* JamileProvider precisa envolver AppSidebar tambem (nao so SidebarInset) - o
          botao "Falar com a JAMILE" da sidebar usa useJamileChat(). O Provider em si
          nao renderiza nenhum elemento DOM (so Context.Provider), entao AppSidebar e
          SidebarInset continuam irmaos diretos pro layout flex do Sidebar funcionar. */}
      <JamileProvider>
        <AppSidebar
          brands={brands}
          userEmail={session.user.email!}
          isAdmin={session.user.role === "ADMIN"}
          pendingProposalsCount={notifications.length}
        />
        <SidebarInset>
          <AppHeader
            brands={brands}
            userEmail={session.user.email!}
            onSignOut={handleSignOut}
            notifications={notifications}
          />
          <main className="flex flex-1 flex-col gap-6 p-6">{children}</main>
        </SidebarInset>
      </JamileProvider>
    </SidebarProvider>
  );
}
