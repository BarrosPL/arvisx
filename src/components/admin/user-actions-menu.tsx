"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN";
  disabledAt: string | Date | null;
}

async function callApi(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? "Não foi possível completar a ação.");
  }
  return body;
}

function TempPasswordDialog({
  open,
  onOpenChange,
  email,
  tempPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  tempPassword: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Senha temporária gerada</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Repasse esta senha para <span className="font-medium text-foreground">{email}</span> por um
          canal seguro (ex: WhatsApp). Ela só aparece nesta tela — não fica salva em nenhum lugar
          visível depois. A pessoa vai ter que trocá-la no primeiro login.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <code className="flex-1 text-sm font-medium">{tempPassword}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(tempPassword);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluído</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserActionsMenu({
  user,
  isSelf,
  isLastActiveAdmin,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  isLastActiveAdmin: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempPasswordResult, setTempPasswordResult] = useState<string | null>(null);

  const isDisabled = Boolean(user.disabledAt);
  const isAdmin = user.role === "ADMIN";

  async function resetPassword() {
    setIsSubmitting(true);
    try {
      const body = await callApi(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
      setTempPasswordResult(body.tempPassword);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao redefinir senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleRole() {
    setIsSubmitting(true);
    try {
      await callApi(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: isAdmin ? "USER" : "ADMIN" }),
      });
      toast.success(isAdmin ? "Rebaixada a usuário comum." : "Promovida a administrador.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar o papel.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleDisabled() {
    setIsSubmitting(true);
    try {
      await callApi(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: !isDisabled }),
      });
      toast.success(isDisabled ? "Conta reativada." : "Conta desativada.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar o status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" disabled={isSubmitting} />}
          aria-label={`Ações para ${user.email}`}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void resetPassword()}>
            <KeyRound />
            Redefinir senha
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isSelf}
            title={isSelf ? "Peça a outro administrador para alterar seu papel" : undefined}
            onClick={() => void toggleRole()}
          >
            {isAdmin ? <ShieldOff /> : <ShieldCheck />}
            {isAdmin ? "Rebaixar a usuário" : "Promover a administrador"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant={isDisabled ? undefined : "destructive"}
            disabled={isSelf || (isLastActiveAdmin && !isDisabled)}
            title={
              isSelf
                ? "Peça a outro administrador para alterar seu status"
                : isLastActiveAdmin && !isDisabled
                  ? "Esta é a única conta admin ativa"
                  : undefined
            }
            onClick={() => void toggleDisabled()}
          >
            {isDisabled ? <UserCheck /> : <UserX />}
            {isDisabled ? "Reativar conta" : "Desativar conta"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {tempPasswordResult ? (
        <TempPasswordDialog
          open
          onOpenChange={(open) => {
            if (!open) setTempPasswordResult(null);
          }}
          email={user.email}
          tempPassword={tempPasswordResult}
        />
      ) : null}
    </>
  );
}
