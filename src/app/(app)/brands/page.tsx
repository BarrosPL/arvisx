import Link from "next/link";
import { ArrowRight, Plus, Tags } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandAvatar } from "@/components/brand-avatar";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { brandStatusTone } from "@/lib/brands/status";

export default async function BrandsPage() {
  const session = await auth();
  const brands = await prisma.brand.findMany({
    where: { brandAccess: { some: { userId: session!.user.id } } },
    orderBy: { priorityOrder: "asc" },
    include: { brandAccess: { where: { userId: session!.user.id }, select: { role: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marcas"
        description="Cadastro, firewall e ordem de prioridade."
        actions={
          <Button render={<Link href="/brands/new" />} nativeButton={false}>
            <Plus />
            Nova marca
          </Button>
        }
      />

      {brands.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Nenhuma marca ainda"
          description="Conecte um login em Conexões pra criar marcas automaticamente a partir das suas contas de anúncio, ou crie uma marca manualmente."
          action={
            <Button render={<Link href="/brands/new" />} nativeButton={false} size="sm">
              <Plus />
              Criar primeira marca
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Prioridade</TableHead>
                  <TableHead>Seu papel</TableHead>
                  <TableHead className="text-right">Palavras-chave</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((brand) => {
                  const status = brandStatusTone(brand.status);
                  return (
                    <TableRow key={brand.id} className="group">
                      <TableCell className="font-medium">
                        <Link href={`/brands/${brand.slug}`} className="flex items-center gap-3">
                          <BrandAvatar name={brand.name} seed={brand.id} size="sm" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate group-hover:underline">{brand.name}</span>
                            <span className="truncate text-xs font-normal text-muted-foreground">{brand.slug}</span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={status.tone} label={status.label} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">#{brand.priorityOrder}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {brand.brandAccess[0]?.role ?? "-"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {brand.topicKeywords.length}
                      </TableCell>
                      <TableCell>
                        <Button
                          render={<Link href={`/brands/${brand.slug}`} aria-label={`Abrir ${brand.name}`} />}
                          nativeButton={false}
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <ArrowRight />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {brands.map((brand) => {
              const status = brandStatusTone(brand.status);
              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.slug}`}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandAvatar name={brand.name} seed={brand.id} size="sm" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{brand.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{brand.slug}</span>
                      </div>
                    </div>
                    <StatusBadge tone={status.tone} label={status.label} className="shrink-0" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Prioridade #{brand.priorityOrder}</span>
                    <span>{brand.brandAccess[0]?.role ?? "-"}</span>
                    <span>{brand.topicKeywords.length} palavra(s)-chave</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
