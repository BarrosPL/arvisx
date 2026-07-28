import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { signOAuthState } from "@/lib/oauth/state";
import { buildMetaAuthUrl, isMetaOAuthConfigured } from "@/lib/oauth/meta";
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from "@/lib/oauth/google";

interface RouteParams {
  params: Promise<{ platform: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { platform } = await params;
    const user = await requireUser();

    if (platform !== "meta" && platform !== "google") {
      return NextResponse.json({ error: "Plataforma inválida" }, { status: 400 });
    }

    if (platform === "meta" && !isMetaOAuthConfigured()) {
      return NextResponse.json({ error: "META_APP_ID/META_APP_SECRET não configurados" }, { status: 503 });
    }
    if (platform === "google" && !isGoogleOAuthConfigured()) {
      return NextResponse.json(
        { error: "GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/DEVELOPER_TOKEN não configurados" },
        { status: 503 }
      );
    }

    const state = signOAuthState(user.id);
    const authUrl = platform === "meta" ? buildMetaAuthUrl(state) : buildGoogleAuthUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return handleApiError(error);
  }
}
