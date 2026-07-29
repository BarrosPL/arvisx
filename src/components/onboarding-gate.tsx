import { Check } from "lucide-react";
import { ConnectAccountButtons } from "@/components/connect-account-buttons";
import { cn } from "@/lib/utils";

interface Step {
  title: string;
  description: string;
}

const STEPS: Step[] = [
  { title: "Conectar Meta Ads ou Google Ads", description: "Um clique, sem precisar preencher nada." },
  { title: "Contas viram marcas automaticamente", description: "Cada conta descoberta já vira sua própria marca — sem atribuição manual." },
  { title: "Aguardar a primeira análise", description: "A JAMILE coleta os dados reais e calcula o diagnóstico sozinha." },
  { title: "Revisar recomendações", description: "Aprove, rejeite ou ajuste cada proposta antes de qualquer execução." },
];

function StepRow({ step, index, active }: { step: Step; index: number; active: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {active ? index + 1 : <Check className="size-3.5" />}
      </div>
      <div className="flex flex-col gap-0.5 pb-4">
        <span className={cn("text-sm font-medium", !active && "text-muted-foreground")}>{step.title}</span>
        <span className="text-xs text-muted-foreground">{step.description}</span>
      </div>
    </div>
  );
}

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
    <div className="mx-auto grid w-full max-w-3xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="flex flex-col gap-0">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Como funciona pra começar</h1>
        {STEPS.map((step, index) => (
          <StepRow key={step.title} step={step} index={index} active={index === 0} />
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight">Vamos conectar suas contas de anúncio</h2>
          <p className="text-sm text-muted-foreground">
            Conecte seu login do Meta ou do Google Ads pra trazer automaticamente todas as contas que
            você administra.
          </p>
        </div>
        <ConnectAccountButtons
          metaConfigured={metaConfigured}
          googleConfigured={googleConfigured}
          metaRedirectUri={metaRedirectUri}
          googleRedirectUri={googleRedirectUri}
        />
        <p className="text-xs text-muted-foreground">
          Você pode conectar mais logins ou revisar as contas a qualquer momento em Conexões.
        </p>
      </div>
    </div>
  );
}
