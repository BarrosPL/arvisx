"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  Images,
  LayoutDashboard,
  Link2,
  ListChecks,
  Plug,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { IconBadge, type IconBadgeColor } from "@/components/icon-badge";
import { useJamileChat } from "@/components/jamile-launcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: IconBadgeColor;
}

export const GLOBAL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard, color: "blue" },
  { href: "/proposals", label: "Propostas", icon: ListChecks, color: "amber" },
  { href: "/creatives", label: "Banco de Criativos", icon: Images, color: "cyan" },
  { href: "/connections", label: "Conexões", icon: Plug, color: "violet" },
];

/** Produto novo e separado do gestor de trafego (SPEC_Funcionalidades.md) - grupo
 * proprio pra nao misturar com a nav de ads. F7 (Links) e o primeiro modulo real; os
 * demais (F1-F6, F8) caem aqui conforme forem implementados. */
export const CONTENT_NAV: NavItem[] = [{ href: "/links", label: "Links", icon: Link2, color: "green" }];

export function AppSidebar({
  userEmail,
  isAdmin,
  pendingProposalsCount = 0,
}: {
  userEmail: string;
  isAdmin?: boolean;
  /** Itens aguardando atenção (todas as contas do usuário) - mostrado como badge no
   * botão "Falar com a JAMILE", já que a decisão em si acontece só pelo chat agora. */
  pendingProposalsCount?: number;
}) {
  const pathname = usePathname();
  const { openChat } = useJamileChat();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                A
              </div>
              <span className="font-semibold">ARVISX</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Falar com a JAMILE"
                  onClick={() => openChat()}
                  className="ai-gradient-bg text-white hover:opacity-90 data-active:bg-transparent"
                >
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/20">
                    <Sparkles className="size-3" />
                  </div>
                  <span className="font-medium">Falar com a JAMILE</span>
                </SidebarMenuButton>
                {pendingProposalsCount > 0 ? <SidebarMenuBadge>{pendingProposalsCount}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {GLOBAL_NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      className="relative data-active:bg-primary/8 data-active:text-primary data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-primary"
                    >
                      <IconBadge icon={item.icon} color={item.color} size="xs" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Conteúdo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {CONTENT_NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      className="relative data-active:bg-primary/8 data-active:text-primary data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-primary"
                    >
                      <IconBadge icon={item.icon} color={item.color} size="xs" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Agendador de Posts — em breve"
                  className="cursor-not-allowed opacity-50"
                >
                  <IconBadge icon={CalendarClock} color="rose" size="xs" />
                  <span>Agendador de Posts</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>Em breve</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Criador de Artes — em breve" className="cursor-not-allowed opacity-50">
                  <IconBadge icon={Wand2} color="cyan" size="xs" />
                  <span>Criador de Artes</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>Em breve</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/admin")}
                    tooltip="Administração"
                    render={<Link href="/admin/users" />}
                    className="relative data-active:bg-primary/8 data-active:text-primary data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-primary"
                  >
                    <IconBadge icon={ShieldCheck} color="blue" size="xs" />
                    <span>Administração</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              <div className="flex aspect-square size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground">
                {userEmail.slice(0, 2)}
              </div>
              <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
