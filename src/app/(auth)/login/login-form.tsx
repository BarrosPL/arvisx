"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [error, formAction, isPending] = useActionState(loginAction, undefined);
  const searchParams = useSearchParams();
  const sessionError = searchParams.get("session_error");
  const passwordChanged = searchParams.get("passwordChanged");
  const alertMessage = error ?? sessionError;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">Entrar</h2>
        <p className="text-sm text-muted-foreground">Painel de gestão de tráfego pago do grupo.</p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        {!alertMessage && passwordChanged ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>Senha alterada. Entre novamente com a nova senha.</span>
          </div>
        ) : null}

        {alertMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{alertMessage}</span>
          </div>
        ) : null}

        <Button type="submit" disabled={isPending} className="mt-1">
          {isPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
