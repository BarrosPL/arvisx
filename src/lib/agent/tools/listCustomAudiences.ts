import { prisma } from "@/lib/prisma";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { listMetaCustomAudiences } from "@/lib/ads/metaAudiences";

/**
 * Publicos personalizados JA CRIADOS na conta - chamada ao vivo na Meta (nao ha tabela
 * local pra isso ainda, diferente de get_metrics/get_campaigns). E leve e sob demanda
 * (a JAMILE so chama quando vai considerar reaproveitar ou excluir um publico, nao a
 * cada mensagem), no mesmo espirito de search_public_ad_library - NAO e o padrao de
 * live-fetch por acesso de tela que foi removido do dashboard (aquele rodava a cada
 * carregamento de pagina e foi o que causou lentidao e o erro code -1 da Meta).
 *
 * So existe para Meta - Google Ads nao tem este conceito nesta integracao.
 */
export async function listCustomAudiences(credentialId: string) {
  const credentialRecord = await prisma.adCredential.findFirst({
    where: { id: credentialId, platform: "META" },
    include: { providerConnection: true },
  });
  if (!credentialRecord) {
    return { error: "Esta conta nao e do Meta - publicos personalizados so existem no Meta Ads." };
  }

  const result = await listMetaCustomAudiences(toPlatformCredential(credentialRecord));
  if (!result.ok) {
    return { error: result.errorMessage ?? "Falha ao listar publicos personalizados" };
  }

  return {
    count: result.audiences.length,
    audiences: result.audiences,
  };
}
