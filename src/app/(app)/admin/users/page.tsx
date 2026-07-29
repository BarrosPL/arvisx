import Link from "next/link";
import { UserPlus, Users as UsersIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";

export default async function AdminUsersPage() {
  const session = await auth();
  const currentUserId = session!.user.id;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      mustChangePassword: true,
      disabledAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const activeAdminCount = users.filter((u) => u.role === "ADMIN" && !u.disabledAt).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Administração"
        description="Contas com acesso ao sistema — criar, desativar, redefinir senha e promover a administrador."
        actions={
          <Button render={<Link href="/admin/users/new" />} nativeButton={false}>
            <UserPlus />
            Nova conta
          </Button>
        }
      />

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Nenhuma conta ainda" />
      ) : (
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name ?? "-"}
                    {user.id === currentUserId ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={user.role === "ADMIN" ? "info" : "neutral"}
                      label={user.role === "ADMIN" ? "Administrador" : "Usuário"}
                    />
                  </TableCell>
                  <TableCell>
                    {user.disabledAt ? (
                      <StatusBadge tone="danger" label="Desativada" />
                    ) : user.mustChangePassword ? (
                      <StatusBadge tone="warning" label="Aguardando 1º login" />
                    ) : (
                      <StatusBadge tone="success" label="Ativa" />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <UserActionsMenu
                      user={user}
                      isSelf={user.id === currentUserId}
                      isLastActiveAdmin={user.role === "ADMIN" && !user.disabledAt && activeAdminCount <= 1}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
