/**
 * Descobre o IP real de quem fez a requisicao, atras do proxy reverso.
 *
 * O X-Forwarded-For NAO e confiavel do jeito ingenuo: qualquer um pode mandar
 * `X-Forwarded-For: 1.2.3.4` na mao. O que salva e que o proxy reverso APENDA o IP que
 * ele mesmo enxergou no fim da lista. Entao numa cadeia
 *
 *     X-Forwarded-For: <mentira do cliente>, <IP visto pelo nosso proxy>
 *                       ^ntrolado pelo atacante   ^unico valor confiavel
 *
 * o valor confiavel e o ULTIMO, nao o primeiro. Ler o primeiro (o que quase todo exemplo
 * de internet faz) deixaria o rate limit inutil: bastaria mandar um IP falso diferente a
 * cada tentativa pra nunca cair no mesmo balde.
 *
 * Quantos saltos descartar depende de quantos proxies existem na frente da aplicacao.
 * Hoje e um so (o Traefik do EasyPanel), que e o default. Se um dia entrar Cloudflare ou
 * outro CDN na frente, sobe TRUSTED_PROXY_HOPS pra 2 - senao TODO mundo passa a
 * compartilhar o mesmo balde (o IP da borda do CDN) e um unico atacante bloqueia o
 * sistema inteiro pra todo mundo.
 */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

/** Usado quando nao da pra determinar o IP - todos caem num balde compartilhado, o que e
 * conservador (limita demais) e nunca permissivo (deixa passar). */
const UNKNOWN_IP = "desconhecido";

export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    // Conta a partir do fim: o ultimo item foi escrito pelo proxy mais proximo de nos.
    const index = chain.length - TRUSTED_PROXY_HOPS;
    const ip = chain[index >= 0 ? index : 0];
    if (ip) return normalize(ip);
  }

  // Fallbacks pra ambientes que nao usam X-Forwarded-For (dev local, alguns hosts).
  const real = headers.get("x-real-ip");
  if (real) return normalize(real);

  return UNKNOWN_IP;
}

/** IPv6 mapeado em IPv4 (::ffff:1.2.3.4) e o mesmo host que 1.2.3.4 - sem isso o mesmo
 * atacante teria dois baldes separados. Colchetes de IPv6 e porta tambem saem. */
function normalize(raw: string): string {
  let ip = raw.toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > 0 ? ip.indexOf("]") : undefined);
  // Porta so e removida de IPv4 - em IPv6 cru os ":" fazem parte do endereco.
  const isIpv4WithPort = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip);
  if (isIpv4WithPort) ip = ip.slice(0, ip.lastIndexOf(":"));
  return ip;
}
