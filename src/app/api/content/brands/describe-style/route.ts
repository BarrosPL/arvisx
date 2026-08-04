import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { openai, AGENT_MODEL } from "@/lib/openai";
import { brandPaletteInputSchema } from "@/lib/content/schema";

const requestSchema = z.object({
  palette: brandPaletteInputSchema,
  voiceAttributes: z.array(z.string()).max(10),
  industry: z.string().trim().max(100).optional(),
});

/** Passo "Estilo" do wizard - frase curta gerada por IA descrevendo o estilo visual
 * (paleta + tom), editável pelo usuário depois. Só texto solto, não persiste nada
 * aqui - o wizard grava em `visualStyleDescription` junto com o resto ao salvar. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = requestSchema.parse(await request.json());

    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Você descreve o estilo visual de uma marca em UMA frase curta (máximo 200 caracteres), em português do Brasil, a partir da paleta de cores e do tom de voz dela. Seja descritivo e específico (ex: 'Estilo clean e minimalista, com azul confiável e dourado sofisticado, transmitindo credibilidade'). Responda só com a frase, sem aspas.",
        },
        {
          role: "user",
          content: `Paleta: primária ${body.palette.primary}, secundária ${body.palette.secondary}, destaque ${body.palette.accent}. Tom de voz: ${body.voiceAttributes.join(", ") || "não definido"}. Setor: ${body.industry ?? "não informado"}.`,
        },
      ],
    });

    const description = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ description });
  } catch (error) {
    return handleApiError(error);
  }
}
