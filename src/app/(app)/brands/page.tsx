import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BRAND_STATUS_LABEL, BRAND_STATUS_VARIANT } from "@/lib/brands/status";

export default async function BrandsPage() {
  const session = await auth();
  const brands = await prisma.brand.findMany({
    where: { brandAccess: { some: { userId: session!.user.id } } },
    orderBy: { priorityOrder: "asc" },
    include: { brandAccess: { where: { userId: session!.user.id }, select: { role: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marcas</h1>
          <p className="text-sm text-muted-foreground">Cadastro, firewall e ordem de prioridade.</p>
        </div>
        <Button render={<Link href="/brands/new" />} nativeButton={false}>
          <Plus />
          Nova marca
        </Button>
      </div>

      <div className="rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Prioridade</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Seu papel</TableHead>
              <TableHead className="text-right">Palavras-chave</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="text-muted-foreground">#{brand.priorityOrder}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/brands/${brand.slug}`} className="hover:underline">
                    {brand.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{brand.slug}</TableCell>
                <TableCell>
                  <Badge variant={BRAND_STATUS_VARIANT[brand.status] ?? "outline"}>
                    {BRAND_STATUS_LABEL[brand.status] ?? brand.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {brand.brandAccess[0]?.role ?? "-"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {brand.topicKeywords.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
