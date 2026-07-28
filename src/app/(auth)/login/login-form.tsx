"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm() {
  const [error, formAction, isPending] = useActionState(loginAction, undefined);
  const searchParams = useSearchParams();
  const sessionError = searchParams.get("session_error");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-1 flex size-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          A
        </div>
        <CardTitle>Entrar no ARVISX</CardTitle>
        <CardDescription>Painel de gestão de tráfego pago do grupo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {sessionError ? (
            <p className="text-sm text-muted-foreground" role="alert">
              {sessionError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} className="mt-1 rounded-full">
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
