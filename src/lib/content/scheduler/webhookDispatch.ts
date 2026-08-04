import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 50;
/** 1min / 5min / 30min / 2h / 6h - indice = attempts APOS incrementar (1a falha usa
 * BACKOFF_MS[0], etc). */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

interface LeadWithForm {
  id: string;
  leadFormId: string;
  data: unknown;
  consent: unknown;
  utm: unknown;
  createdAt: Date;
  webhookAttempts: number;
  leadForm: { bioPageId: string; webhookUrl: string | null; webhookSecretEnc: string | null };
}

function signPayload(body: string, secret: string): { timestamp: number; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { timestamp, signature };
}

async function dispatchOne(lead: LeadWithForm): Promise<void> {
  const { webhookUrl, webhookSecretEnc } = lead.leadForm;
  if (!webhookUrl || !webhookSecretEnc) {
    await prisma.lead.update({ where: { id: lead.id }, data: { webhookStatus: "DISABLED" } });
    return;
  }

  const payload = {
    event: "lead.created",
    leadId: lead.id,
    formId: lead.leadFormId,
    bioPageId: lead.leadForm.bioPageId,
    data: lead.data,
    consent: lead.consent,
    utm: lead.utm,
    createdAt: lead.createdAt.toISOString(),
  };
  const body = JSON.stringify(payload);
  const secret = decryptSecret(webhookSecretEnc);
  const { timestamp, signature } = signPayload(body, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ARVISX-Signature": `sha256=${signature}`,
        "X-ARVISX-Timestamp": String(timestamp),
      },
      body,
      signal: controller.signal,
    });

    if (response.ok) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { webhookStatus: "SENT", webhookLastError: null },
      });
      return;
    }
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const attempts = lead.webhookAttempts + 1;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { webhookStatus: "FAILED", webhookAttempts: attempts, webhookLastError: message, webhookNextAttemptAt: null },
      });
      return;
    }
    const delayMs = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        webhookAttempts: attempts,
        webhookLastError: message,
        webhookNextAttemptAt: new Date(Date.now() + delayMs),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sem tentativa inline no request de submit de proposito - lead nasce PENDING, e
 * pego aqui no proximo tick (1-5min de latencia aceitavel, evita fire-and-forget
 * fragil num processo Node standalone). Query pega PENDING vencidos (nextAttemptAt
 * nulo ou no passado), processa em lote pra nao segurar o tick indefinidamente.
 */
export async function runWebhookDispatchRound(): Promise<{ processed: number }> {
  const leads = await prisma.lead.findMany({
    where: {
      webhookStatus: "PENDING",
      OR: [{ webhookNextAttemptAt: null }, { webhookNextAttemptAt: { lte: new Date() } }],
    },
    take: BATCH_SIZE,
    include: { leadForm: { select: { bioPageId: true, webhookUrl: true, webhookSecretEnc: true } } },
  });

  for (const lead of leads) {
    await dispatchOne(lead);
  }

  return { processed: leads.length };
}
