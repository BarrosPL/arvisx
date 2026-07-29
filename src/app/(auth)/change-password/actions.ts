"use server";

import bcrypt from "bcryptjs";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { withUserContext } from "@/lib/db/withUserContext";
import { changePasswordSchema } from "@/lib/account/schema";

export async function changePasswordAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const user = await requireUser();

  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (newPassword !== confirmPassword) {
    return "As senhas não coincidem.";
  }

  const parsed = changePasswordSchema.safeParse({ newPassword });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Senha inválida.";
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await withUserContext(user.id, (tx) =>
    tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    })
  );

  // Forca novo login: a sessao JWT atual ainda carrega mustChangePassword=true (o
  // token so e reavaliado no proximo sign-in), entao um simples redirect ficaria
  // preso num loop de volta pra esta pagina.
  await signOut({ redirectTo: "/login?passwordChanged=1" });
  return undefined;
}
