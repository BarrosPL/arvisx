import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Alguns modulos (ex: lib/openai.ts) leem env var no carregamento do modulo, nao
    // so em runtime - sem isso, qualquer teste que importe (mesmo so pra testar OUTRA
    // funcao do mesmo arquivo) quebra com "Missing credentials".
    setupFiles: ["dotenv/config"],
  },
});
