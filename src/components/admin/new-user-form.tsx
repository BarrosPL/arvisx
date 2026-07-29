"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreatedResult {
  email: string;
  tempPassword: string;
}

export function NewUserForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Não foi possível criar a conta.");
        return;
      }
      setCreated({ email: body.user.email, tempPassword: body.tempPassword });
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  if (created) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Conta criada para {created.email}</p>
          <p className="text-xs text-muted-foreground">
            Repasse esta senha temporária por um canal seguro — ela só aparece aqui, uma única vez.
            A pessoa é obrigada a trocá-la no primeiro login.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <code className="flex-1 text-sm font-medium">{created.tempPassword}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(created.tempPassword);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCreated(null);
              setName("");
              setEmail("");
              setRole("USER");
            }}
          >
            Criar outra conta
          </Button>
          <Button type="button" onClick={() => router.push("/admin/users")}>
            Ir para a lista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Papel</Label>
        <Select value={role} onValueChange={(value) => setRole(value as "USER" | "ADMIN")}>
          <SelectTrigger id="role" className="w-full">
            <SelectValue>{(value: "USER" | "ADMIN") => (value === "ADMIN" ? "Administrador" : "Usuário")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">Usuário</SelectItem>
            <SelectItem value="ADMIN">Administrador</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Administradores acessam este painel e podem criar/gerenciar outras contas.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSaving} className="w-fit">
          {isSaving ? "Criando..." : "Criar conta"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} className="w-fit">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
