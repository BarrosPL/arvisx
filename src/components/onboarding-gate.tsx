import { Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectAccountButtons } from "@/components/connect-account-buttons";

export function OnboardingGate({
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
    <Card className="mx-auto w-full max-w-xl shadow-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plug className="size-5" />
        </div>
        <CardTitle>Vamos conectar suas contas de anúncio</CardTitle>
        <CardDescription>
          Conecte seu login do Meta ou do Google Ads para trazer automaticamente todas as contas de
          anúncio que você administra. Depois é só escolher qual conta pertence a qual marca.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ConnectAccountButtons
          metaConfigured={metaConfigured}
          googleConfigured={googleConfigured}
          metaRedirectUri={metaRedirectUri}
          googleRedirectUri={googleRedirectUri}
        />
        <p className="text-center text-xs text-muted-foreground">
          Você pode conectar mais logins ou revisar as contas a qualquer momento em Conexões.
        </p>
      </CardContent>
    </Card>
  );
}
