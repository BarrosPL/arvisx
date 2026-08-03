import type { NextConfig } from "next";

/**
 * O cookie de sessao e httpOnly, entao script nenhum le o JWT direto. O caminho que
 * sobra pra um atacante e indireto: injetar script na pagina (XSS) e, de dentro dela,
 * chamar /api/auth/session ou as rotas autenticadas usando o cookie do proprio usuario -
 * o navegador anexa o cookie sozinho. Estes cabecalhos fecham parte desse caminho.
 *
 * Nao incluo Content-Security-Policy aqui de proposito: no Next uma CSP util exige
 * nonce por requisicao gerado no proxy.ts e propagado, e uma CSP mal montada ou quebra a
 * aplicacao ou fica com 'unsafe-inline' (que nao protege contra nada). E um trabalho
 * separado, nao um cabecalho a mais nesta lista.
 */
const securityHeaders = [
  // Impede que o navegador "adivinhe" o tipo de um arquivo e execute como script algo
  // que servimos como texto/imagem.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ninguem pode embutir o painel num iframe - fecha clickjacking (sobrepor um iframe
  // invisivel do sistema e fazer o Renan clicar em "aprovar" sem saber).
  { key: "X-Frame-Options", value: "DENY" },
  // Versao moderna e mais forte da linha acima, para navegadores que a suportam.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Nao vaza a URL interna (que carrega ids de conta/proposta) pra sites externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // O painel nao usa nada disso; negar explicitamente reduz o que um script injetado
  // conseguiria acionar.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
