"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  Image,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Plug,
  Plus,
  Wand2,
} from "lucide-react";
import { BrandAvatar } from "@/components/brand-avatar";
import { IconBadge, type IconBadgeColor } from "@/components/icon-badge";
import { StatusBadge } from "@/components/status-badge";
import { brandStatusTone } from "@/lib/brands/status";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

export interface BrandNavItem {
  id: string;
  slug: string;
  name: string;
  status: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: IconBadgeColor;
}

export const GLOBAL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard, color: "blue" },
  { href: "/connections", label: "Conexões", icon: Plug, color: "violet" },
];

export function brandNavFor(slug: string): NavItem[] {
  const base = `/brands/${slug}`;
  return [
    { href: base, label: "Visão geral", icon: LayoutDashboard, color: "blue" },
    { href: `${base}/credentials`, label: "Contas e campanhas", icon: KeyRound, color: "violet" },
    { href: `${base}/library`, label: "Biblioteca", icon: Image, color: "orange" },
    { href: `${base}/proposals`, label: "Propostas", icon: ListChecks, color: "amber" },
  ];
}

export function AppSidebar({
  brands,
  userEmail,
}: {
  brands: BrandNavItem[];
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const brandSlugMatch = pathname.match(/^\/brands\/([^/]+)/);
  const activeBrand = brandSlugMatch ? (brands.find((b) => b.slug === brandSlugMatch[1]) ?? null) : null;
  const navItems = activeBrand ? brandNavFor(activeBrand.slug) : GLOBAL_NAV;

  function goTo(href: string) {
    router.push(href);
    setSwitcherOpen(false);
  }

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
            <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
              <PopoverTrigger className="flex w-full items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                {activeBrand ? (
                  <BrandAvatar name={activeBrand.name} seed={activeBrand.id} size="xs" />
                ) : (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <LayoutDashboard className="size-3" />
                  </div>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium leading-tight">
                    {activeBrand ? activeBrand.name : "Visão Geral"}
                  </span>
                  {activeBrand ? (
                    <StatusBadge {...brandStatusTone(activeBrand.status)} className="h-4 w-fit px-1.5 text-[10px]" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Trocar de marca</span>
                  )}
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar..." />
                  <CommandList>
                    <CommandEmpty>Nada encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="visao-geral" onSelect={() => goTo("/dashboard")}>
                        <Check className={cn("mr-2 size-4", !activeBrand ? "opacity-100" : "opacity-0")} />
                        Visão Geral
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Marcas">
                      {brands.map((brand) => (
                        <CommandItem key={brand.id} value={brand.name} onSelect={() => goTo(`/brands/${brand.slug}`)}>
                          <Check
                            className={cn("mr-2 size-4", activeBrand?.id === brand.id ? "opacity-100" : "opacity-0")}
                          />
                          <BrandAvatar name={brand.name} seed={brand.id} size="xs" className="mr-1.5" />
                          <span className="flex-1 truncate">{brand.name}</span>
                          <StatusBadge {...brandStatusTone(brand.status)} className="h-4 shrink-0 px-1.5 text-[10px]" />
                        </CommandItem>
                      ))}
                      <CommandItem value="nova-marca" onSelect={() => goTo("/brands/new")}>
                        <Plus className="mr-2 size-4" />
                        Nova marca
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
