import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const brands = await prisma.brand.findMany({
    where: { brandAccess: { some: { userId: session.user.id } } },
    orderBy: { priorityOrder: "asc" },
    select: { id: true, slug: true, name: true, status: true },
  });

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <SidebarProvider>
      <AppSidebar brands={brands} userEmail={session.user.email!} isAdmin={session.user.role === "ADMIN"} />
      <JamileProvider>
        <SidebarInset>
          <AppHeader brands={brands} userEmail={session.user.email!} onSignOut={handleSignOut} />
          <main className="flex flex-1 flex-col gap-6 p-6">{children}</main>
        </SidebarInset>
      </JamileProvider>
    </SidebarProvider>
  );
}
