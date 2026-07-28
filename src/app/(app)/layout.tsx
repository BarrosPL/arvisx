import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const brands = await prisma.brand.findMany({
    where: { brandAccess: { some: { userId: session.user.id } } },
    orderBy: { priorityOrder: "asc" },
    select: { id: true, slug: true, name: true, status: true },
  });

  return (
    <SidebarProvider>
      <AppSidebar brands={brands} userEmail={session.user.email!} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="ghost" size="sm" type="submit">
              <LogOut />
              Sair
            </Button>
          </form>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
