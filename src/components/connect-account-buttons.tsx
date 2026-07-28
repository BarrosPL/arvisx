import { Button } from "@/components/ui/button";
import { MetaMark, GoogleAdsMark, PlatformIconTile } from "@/components/brand-marks";

function ConnectCard({
  platform,
  title,
  description,
  href,
  configured,
  configHint,
  mark,
}: {
  platform: "META" | "GOOGLE";
  title: string;
  description: string;
  href: string;
  configured: boolean;
  configHint: React.ReactNode;
  mark: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20 sm:flex-row sm:items-center">
      <PlatformIconTile platform={platform} />
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
        {!configured ? <span className="text-xs text-muted-foreground">{configHint}</span> : null}
      </div>
      <Button
        render={<a href={href} />}
        nativeButton={false}
        disabled={!configured}
        className="rounded-full shrink-0"
      >
        {mark}
        Conectar
      </Button>
    </div>
  );
}

export function ConnectAccountButtons({
  metaConfigured,
  googleConfigured,
  metaRedirectUri,
  googleRedirectUri,
}: {
  metaConfigured: boolean;
  googleConfigured: boolean;
  metaRedirectUri: string;
  googleRedirectUri: string;
}) {
  return (
    <div className="flex w-full flex-col gap-3">
      <ConnectCard
        platform="META"
        title="Meta Ads"
        description="Traz automaticamente todas as contas de anúncio do seu Business Manager."
        href="/api/oauth/meta/start"
        configured={metaConfigured}
        mark={<MetaMark />}
        configHint={
          <>
            META_APP_ID/META_APP_SECRET não configurados. Redirect URI:{" "}
            <code className="rounded bg-muted px-1">{metaRedirectUri}</code>
          </>
        }
      />
      <ConnectCard
        platform="GOOGLE"
        title="Google Ads"
        description="Traz automaticamente as contas de anúncio visíveis ao seu login."
        href="/api/oauth/google/start"
        configured={googleConfigured}
        mark={<GoogleAdsMark />}
        configHint={
          <>
            GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/DEVELOPER_TOKEN não configurados. Redirect URI:{" "}
            <code className="rounded bg-muted px-1">{googleRedirectUri}</code>
          </>
        }
      />
    </div>
  );
}
