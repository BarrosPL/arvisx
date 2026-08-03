import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Prefixo "_" = descarte deliberado, nao esquecimento. Sao dois casos legitimos:
      // desestruturar so pra OMITIR um campo (redactConnection tira os tokens
      // criptografados) e assinatura imposta por framework (handler de rota do Next
      // recebe request mesmo quando nao usa). Sem isto, os dois viram aviso permanente e
      // acabam mascarando import/variavel que sobrou de verdade.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
