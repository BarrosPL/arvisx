import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { clientIpFrom } from "@/lib/security/clientIp";
import { hashIp } from "@/lib/content/hash";
import { verifyTurnstileToken } from "@/lib/content/turnstile";
import { checkFormSubmitThrottle, formSubmitKeysFor, registerFormSubmit } from "@/lib/content/formSubmitPolicy";
import { computeSessionHash } from "@/lib/content/sessionHash";
import { submitLeadSchema, type LeadFormField } from "@/lib/content/schema";

interface RouteParams {
  params: Promise<{ leadFormId: string }>;
}

/**
 * Rota PUBLICA (sem requireUser) - qualquer visitante da bio page pode chamar.
 * Ordem deliberada (barato primeiro): honeypot -> rate limit (memoria) -> Turnstile
 * (rede) -> validacao dos campos -> consent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadFormId } = await params;
    const leadForm = await prisma.leadForm.findUnique({ where: { id: leadFormId } });
    if (!leadForm || !leadForm.isActive) {
      return NextResponse.json({ error: "Formulário não encontrado" }, { status: 404 });
    }

    const body = submitLeadSchema.parse(await request.json());
    const successAction = leadForm.successAction as { type: "message" | "redirect"; message?: string; redirectUrl?: string };

    // Honeypot preenchido: responde como se tivesse dado certo, sem criar Lead nem
    // gastar as checagens seguintes - nao sinaliza o bloqueio pro bot.
    if (body.honeypot) {
      return NextResponse.json({ leadId: null, successAction });
    }

    const ip = clientIpFrom(request.headers);
    const throttleKeys = formSubmitKeysFor(ip, leadFormId);
    const throttle = checkFormSubmitThrottle(throttleKeys);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: "Muitas tentativas - tente de novo em alguns minutos" },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    const turnstile = await verifyTurnstileToken(body.turnstileToken, ip);
    if (!turnstile.ok) {
      return NextResponse.json({ error: "Falha na verificação anti-spam" }, { status: 403 });
    }

    const fieldDefs = leadForm.fields as unknown as LeadFormField[];

    // So guarda chaves DECLARADAS no form - nunca um spread do payload cru do cliente
    // (RGPD: minimizacao, so campo com finalidade declarada).
    const data: Record<string, string> = {};
    for (const field of fieldDefs) {
      const value = body.fields[field.key]?.trim() ?? "";
      if (field.required && !value) {
        return NextResponse.json({ error: `Campo obrigatório: ${field.label}` }, { status: 400 });
      }
      if (value) data[field.key] = value;
    }

    const purposes = Array.from(new Set(fieldDefs.map((field) => field.purpose)));
    const requiredPurposes = new Set(fieldDefs.filter((field) => field.required).map((field) => field.purpose));
    const now = new Date();

    if (leadForm.consentRequired) {
      for (const purpose of requiredPurposes) {
        if (!body.consent[purpose]) {
          return NextResponse.json({ error: "É necessário aceitar os termos para continuar" }, { status: 400 });
        }
      }
    }

    // Snapshot LITERAL do texto de consentimento agora - nunca um ponteiro pra versao
    // atual do form (RGPD: a prova e da versao aceita naquele momento).
    const consent = purposes.map((purpose) => ({
      purpose,
      text: leadForm.consentText,
      given: !!body.consent[purpose],
      at: now.toISOString(),
    }));
    const consentGiven = Array.from(requiredPurposes).every((purpose) => body.consent[purpose] === true);

    const userAgent = request.headers.get("user-agent");

    const lead = await prisma.lead.create({
      data: {
        leadFormId,
        brandId: leadForm.brandId,
        data,
        consent,
        consentGiven,
        ipHash: hashIp(ip),
        userAgent,
        utm: body.utm ?? undefined,
        referrer: body.referrer,
        webhookStatus: leadForm.webhookUrl ? "PENDING" : "DISABLED",
      },
    });

    // So conta contra a cota depois de confirmar que era um envio de verdade (passou
    // honeypot+campos+consent) - ver comentario em formSubmitPolicy.ts.
    registerFormSubmit(throttleKeys);

    // Gravado AQUI dentro, nao numa segunda chamada do cliente pro /api/public/events -
    // evita contagem duplicada/perdida (ver comentario na secao Analytics do plano).
    await prisma.bioEvent.create({
      data: {
        bioPageId: leadForm.bioPageId,
        event: "FORM_SUBMIT",
        sessionHash: computeSessionHash(ip, userAgent ?? ""),
        utm: body.utm,
      },
    });

    return NextResponse.json({ leadId: lead.id, successAction });
  } catch (error) {
    return handleApiError(error);
  }
}
