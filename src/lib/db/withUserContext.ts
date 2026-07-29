import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Roda `fn` dentro de uma transacao que define app.current_user_id via set_config
 * (equivalente a SET LOCAL - vale so para esta transacao, nunca vaza para outra
 * requisicao que reuse a mesma conexao do pool). As policies de RLS da tabela User
 * (migration add_user_admin_rls) usam essa variavel para reconsultar o proprio banco
 * e decidir se quem esta chamando e admin - nao confiam em nenhuma flag calculada aqui
 * na aplicacao, entao passar o userId errado nao "engana" a policy.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: TxClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}
