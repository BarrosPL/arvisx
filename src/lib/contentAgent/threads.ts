import { prisma } from "@/lib/prisma";

/** Espelha getActiveUserThread/startNewUserThread (agent/orchestrator.ts) pro
 * ContentThread - mesma garantia de "uma thread ativa por usuário", imposta pelo
 * índice único parcial da migration (não só por convenção de app). */
export async function getActiveContentThread(userId: string) {
  const existing = await prisma.contentThread.findFirst({ where: { userId, isActive: true } });
  if (existing) return existing;

  try {
    return await prisma.contentThread.create({ data: { userId, isActive: true } });
  } catch {
    // Corrida rara (duas requisicoes tentando criar a primeira thread do usuario ao
    // mesmo tempo) - o indice unico parcial bloqueia a segunda, so buscar de novo resolve.
    return prisma.contentThread.findFirstOrThrow({ where: { userId, isActive: true } });
  }
}

export async function startNewContentThread(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.contentThread.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
    return tx.contentThread.create({ data: { userId, isActive: true } });
  });
}
