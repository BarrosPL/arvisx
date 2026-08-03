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
  experimental: {
    /**
     * Default do Next e 10MB - e SILENCIOSO ao estourar: o proxy.ts (middleware de
     * auth, que roda em toda rota /api) buferiza o corpo inteiro em memoria pra poder
     * ler duas vezes, e se passar do limite so CORTA os bytes excedentes sem erro
     * nenhum pro cliente. Sem levantar isto, um upload de video acima de 10MB nao
     * falharia com mensagem clara - o JSON chegaria truncado na rota e o vídeo
     * salvo ficaria corrompido em silencio.
     *
     * 100mb cobre um video de anuncio real (a base64 do corpo ainda inflaria ~33% em
     * cima do arquivo cru, mais a imagem de capa) sem abrir a porta pra qualquer coisa -
     * nao e um limite "sem teto", so grande o bastante pro caso de uso real.
     */
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
