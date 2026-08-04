import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SceneNode } from "../src/lib/content/render/scene";

const adapter = new PrismaPg({ connectionString: process.env.APP_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface FormatSeed {
  id: string;
  network: string;
  placement: string;
  width: number;
  height: number;
  safeArea: { top: number; bottom: number; left: number; right: number };
}

/** 3 formatos (não os 17 da matriz completa) - safe areas da tabela F3.1 da spec. */
const FORMATS: FormatSeed[] = [
  { id: "ig_feed_square", network: "instagram", placement: "feed", width: 1080, height: 1080, safeArea: { top: 60, bottom: 60, left: 60, right: 60 } },
  { id: "ig_feed_portrait", network: "instagram", placement: "feed", width: 1080, height: 1350, safeArea: { top: 60, bottom: 60, left: 60, right: 60 } },
  { id: "ig_story", network: "instagram", placement: "story", width: 1080, height: 1920, safeArea: { top: 250, bottom: 250, left: 60, right: 60 } },
];

/**
 * Template "capa simples" (arquétipo genérico o bastante pra vários pedidos) -
 * eyebrow + headline + subheadline + botão de CTA. Parametrizado por formato (só
 * padding muda com a safe area) em vez de 3 JSONs quase idênticos escritos à mão.
 */
function buildCoverTemplate(format: FormatSeed): SceneNode {
  const { top, bottom, left, right } = format.safeArea;
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "{{brand.palette.primary}}",
        padding: `${top}px ${right}px ${bottom}px ${left}px`,
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontSize: 32,
              color: "{{brand.palette.accent}}",
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "flex",
            },
            children: "",
          },
          slotKey: "eyebrow",
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 24 },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 88, color: "{{brand.palette.textOnPrimary}}", fontWeight: 700, lineHeight: 1.05, display: "flex" },
                  children: "",
                },
                slotKey: "headline",
              },
              {
                type: "div",
                props: {
                  // `textOnPrimary` (nunca `secondary`) - `secondary` é escolha livre
                  // do usuário sem garantia de contraste contra o fundo `primary`
                  // (achado real: 1.97:1 com uma combinação de teste, bem abaixo do
                  // AA 4.5:1); `textOnPrimary` é sempre calculado pra ser legível.
                  style: { fontSize: 36, color: "{{brand.palette.textOnPrimary}}", fontWeight: 400, lineHeight: 1.3, opacity: 0.8, display: "flex" },
                  children: "",
                },
                slotKey: "subheadline",
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              padding: "28px 0",
            },
            children: [
              {
                type: "span",
                props: { style: { fontSize: 36, color: "{{brand.palette.primary}}", fontWeight: 700 }, children: "" },
                slotKey: "cta",
              },
            ],
          },
        },
      ],
    },
  };
}

const COVER_SLOTS = {
  eyebrow: { minFontSize: 24, maxFontSize: 32, maxChars: 30, maxLines: 1 },
  headline: { minFontSize: 40, maxFontSize: 88, maxChars: 100, maxLines: 5 },
  subheadline: { minFontSize: 28, maxFontSize: 36, maxChars: 150, maxLines: 3 },
  cta: { minFontSize: 28, maxFontSize: 36, maxChars: 40, maxLines: 1 },
};

async function main() {
  for (const format of FORMATS) {
    await prisma.format.upsert({
      where: { id: format.id },
      update: { network: format.network, placement: format.placement, width: format.width, height: format.height, safeArea: format.safeArea },
      create: format,
    });
  }

  for (const format of FORMATS) {
    const existing = await prisma.template.findFirst({ where: { formatId: format.id, archetype: "capa_simples" } });
    const data = {
      formatId: format.id,
      archetype: "capa_simples",
      styleTags: ["editorial"],
      slots: COVER_SLOTS,
      sceneJson: buildCoverTemplate(format) as object,
    };
    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data });
    } else {
      await prisma.template.create({ data });
    }
  }

  const formatCount = await prisma.format.count();
  const templateCount = await prisma.template.count();
  console.log(`Seed de conteúdo concluído: ${formatCount} formato(s), ${templateCount} template(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
