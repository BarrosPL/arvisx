"use client";

import { usePathname } from "next/navigation";
import { LogOut, User } from "lucide-react";
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
import { GLOBAL_NAV } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import type { AttentionEntry } from "@/lib/notifications";

/**
 * Header global - titulo da secao atual (deriva do pathname) + sino de notificacao +
 * menu do usuario.
 */
export function AppHeader({
  userEmail,
  onSignOut,
  notifications,
}: {
  userEmail: string;
  onSignOut: () => Promise<void>;
  notifications: AttentionEntry[];
}) {
  const pathname = usePathname();

  const sectionLabel =
    GLOBAL_NAV.find((navItem) => navItem.href === pathname)?.label ?? "";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <span className="truncate font-medium">{sectionLabel}</span>
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell items={notifications} />
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
      </div>
    </header>
  );
}
