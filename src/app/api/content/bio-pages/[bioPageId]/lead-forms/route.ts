import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";
import { createLeadFormSchema } from "@/lib/content/schema";
import { generateWebhookSecret } from "@/lib/content/webhookSecret";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    const { bioPage } = await requireBioPageAccess(bioPageId);
    const body = createLeadFormSchema.parse(await request.json());

    const secret = body.webhookUrl ? generateWebhookSecret() : null;

    const leadForm = await prisma.leadForm.create({
      data: {
        bioPageId,
        brandId: bioPage.brandId,
        name: body.name,
        fields: body.fields,
        consentText: body.consentText,
        consentRequired: body.consentRequired,
        privacyPolicyUrl: body.privacyPolicyUrl,
        successAction: body.successAction,
        webhookUrl: body.webhookUrl,
        webhookSecretEnc: secret?.encrypted,
      },
    });

    // webhookSecret so aparece nesta resposta - nunca mais depois (nem em GET).
    return NextResponse.json({ leadForm, webhookSecret: secret?.plaintext });
  } catch (error) {
    return handleApiError(error);
  }
}
