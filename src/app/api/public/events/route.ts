import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { clientIpFrom } from "@/lib/security/clientIp";
import { checkRateLimit, registerFailure, type RateLimitRule } from "@/lib/security/rateLimit";
import { computeSessionHash, detectDevice } from "@/lib/content/sessionHash";

const EVENTS_PER_IP: RateLimitRule = { limit: 60, windowMs: 60_000 };

const trackEventSchema = z.object({
  bioPageId: z.string().min(1),
  blockId: z.string().optional(),
  event: z.enum(["PAGE_VIEW", "BLOCK_CLICK"]),
  utm: z.record(z.string(), z.string()).optional(),
});

/**
 * Rota PUBLICA - chamada pelo client island da bio page SO depois do visitante aceitar
 * "analytics" no banner de consentimento (ver consent-banner.tsx) - o banner controla
 * isso do lado do cliente, entao aqui so falta nao confiar em IP/UA vindos do corpo
 * (sessionHash e sempre recalculado a partir dos headers reais da requisicao).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIpFrom(request.headers);
    const rateLimitKey = `bioevent:ip:${ip}`;
    if (checkRateLimit(rateLimitKey, EVENTS_PER_IP).blocked) {
      return NextResponse.json({ error: "Muitas requisições" }, { status: 429 });
    }
    registerFailure(rateLimitKey, EVENTS_PER_IP);

    const body = trackEventSchema.parse(await request.json());
    const userAgent = request.headers.get("user-agent") ?? "";

    await prisma.bioEvent.create({
      data: {
        bioPageId: body.bioPageId,
        blockId: body.blockId,
        event: body.event,
        sessionHash: computeSessionHash(ip, userAgent),
        utm: body.utm,
        device: detectDevice(userAgent),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
