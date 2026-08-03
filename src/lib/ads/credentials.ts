import { decryptSecret } from "@/lib/crypto";
import type { AdCredential, ProviderConnection } from "@/generated/prisma/client";
import type { PlatformCredential } from "./types";

/** Junta uma atribuicao (AdCredential) com o login OAuth (ProviderConnection) que a autentica. */
export function toPlatformCredential(
  credential: AdCredential & { providerConnection: ProviderConnection }
): PlatformCredential {
  const connection = credential.providerConnection;
  return {
    id: credential.id,
    platform: credential.platform,
    externalAccountId: credential.externalAccountId,
    loginCustomerId: credential.loginCustomerId,
    accessToken: connection.encryptedAccessToken ? decryptSecret(connection.encryptedAccessToken) : "",
    refreshToken: connection.encryptedRefreshToken ? decryptSecret(connection.encryptedRefreshToken) : null,
  };
}

/** Remove os blobs criptografados antes de devolver a conexao para o cliente HTTP. */
export function redactConnection(record: ProviderConnection) {
  const { encryptedAccessToken: _accessToken, encryptedRefreshToken: _refreshToken, ...safe } = record;
  return safe;
}
