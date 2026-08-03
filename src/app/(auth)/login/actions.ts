"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/lib/auth";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // Bloqueio por tentativas e a UNICA condicao que ganha mensagem propria. Todo o
    // resto - email inexistente, senha errada, conta desativada - responde exatamente
    // igual, pra nao virar um jeito de descobrir quais emails existem na base.
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.";
    }
    if (error instanceof AuthError) {
      return "Email ou senha invalidos.";
    }
    throw error;
  }
}
