import { z } from "zod";

export const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "minimo de 8 caracteres"),
});
