import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireLeadFormAccess } from "@/lib/content/access";
import { updateLeadFormSchema } from "@/lib/content/schema";
import { generateWebhookSecret } from "@/lib/content/webhookSecret";

interface RouteParams {
  params: Promise<{ leadFormId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { leadFormId } = await params;
    const { leadForm } = await requireLeadFormAccess(leadFormId);
    return NextResponse.json({ leadForm });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadFormId } = await params;
    const { leadForm: current } = await requireLeadFormAccess(leadFormId);
    const { webhookUrl, ...body } = updateLeadFormSchema.parse(await request.json());

    // So mexe no segredo se a URL do webhook realmente mudou - "nao veio no corpo" e
    // diferente de "mandou null pra apagar" e de "mandou uma URL nova".
    let webhookFields: { webhookUrl?: string | null; webhookSecretEnc?: string | null } = {};
    let webhookSecret: string | undefined;
    if (webhookUrl !== undefined && webhookUrl !== current.webhookUrl) {
      if (webhookUrl === null) {
        webhookFields = { webhookUrl: null, webhookSecretEnc: null };
      } else {
        const secret = generateWebhookSecret();
        webhookFields = { webhookUrl, webhookSecretEnc: secret.encrypted };
        webhookSecret = secret.plaintext;
      }
    }

    const leadForm = await prisma.leadForm.update({
      where: { id: leadFormId },
      data: { ...body, ...webhookFields },
    });
    return NextResponse.json({ leadForm, webhookSecret });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { leadFormId } = await params;
    await requireLeadFormAccess(leadFormId);
    await prisma.leadForm.delete({ where: { id: leadFormId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
