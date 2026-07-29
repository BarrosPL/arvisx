"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GLOBAL_NAV, brandNavFor, type BrandNavItem } from "@/components/app-sidebar";

/**
 * Header global - titulo/breadcrumb da secao atual (deriva do pathname, mesma logica
 * de deteccao de marca ativa do AppSidebar) + menu do usuario, substituindo o botao
 * "Sair" solto que competia visualmente com o resto do produto.
 */
export function AppHeader({
  brands,
  userEmail,
  onSignOut,
}: {
  brands: BrandNavItem[];
  userEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  const brandSlugMatch = pathname.match(/^\/brands\/([^/]+)/);
  const activeBrand = brandSlugMatch ? (brands.find((b) => b.slug === brandSlugMatch[1]) ?? null) : null;

  let sectionLabel: string;
  if (activeBrand) {
    const item = brandNavFor(activeBrand.slug).find((navItem) => navItem.href === pathname);
    sectionLabel = item?.label ?? "Visão geral";
  } else {
    const item = GLOBAL_NAV.find((navItem) => navItem.href === pathname);
    sectionLabel =
      item?.label ?? (pathname === "/brands" ? "Marcas" : pathname === "/brands/new" ? "Nova marca" : "");
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          {activeBrand ? (
            <>
              <span className="min-w-0 truncate text-muted-foreground">{activeBrand.name}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 truncate font-medium">{sectionLabel}</span>
            </>
          ) : (
            <span className="truncate font-medium">{sectionLabel}</span>
          )}
        </nav>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu do usuário — ${userEmail}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted"
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground">
            {userEmail.slice(0, 2)}
          </div>
          <span className="hidden max-w-40 truncate text-muted-foreground sm:inline">{userEmail}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
              <User className="size-3.5" />
              <span className="truncate">{userEmail}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              void onSignOut();
            }}
          >
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
