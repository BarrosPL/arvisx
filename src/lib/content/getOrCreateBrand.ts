import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Brand } from "@/generated/prisma/client";

/**
 * V1 nao tem tela de criar Brand - e auto-provisionado no primeiro acesso a /links,
 * mesmo espirito do "1 login = dono de tudo" ja usado pro gestor de trafego
 * (AdCredential nasce da descoberta automatica, nunca de um formulario de criacao).
 * Um usuario pode ter mais de um Brand no schema (agencia gerenciando varios clientes),
 * mas o v1 so usa/cria UM - findFirst, nao uma lista.
 */
export async function getOrCreateBrandForUser(userId: string, userEmail: string, userName?: string | null): Promise<Brand> {
  const existing = await prisma.brand.findFirst({ where: { ownerUserId: userId } });
  if (existing) return existing;

  return prisma.brand.create({
    data: {
      ownerUserId: userId,
      name: userName || userEmail,
      // Slug so precisa ser unico - Brand nao aparece em nenhuma URL publica hoje (quem
      // e publico e BioPage.slug). 48 bits de entropia, sem round-trip extra pra checar
      // colisao.
      slug: `brand-${randomBytes(6).toString("hex")}`,
    },
  });
}
