import { Loader2, AlertTriangle } from "lucide-react";
import { RefreshDataButton } from "@/components/refresh-data-button";

export interface CollectionFailure {
  brandName: string;
  platform: string;
  errorMessage: string | null;
}

/**
 * Diz POR QUE o dashboard esta vazio, em vez de mostrar zero em silencio.
 *
 * Existe por causa de um problema real: quando a coleta de campanha nunca rodou (ou
 * falhou em todas as contas), a tela ficava toda zerada sem nenhuma pista, e nao dava
 * pra distinguir "ainda nao coletei" de "coletei e nao ha campanha ativa" de "a
 * credencial quebrou".
 */
export function CollectionStatusNotice({
  neverCollected,
  failures,
}: {
  neverCollected: boolean;
  failures: CollectionFailure[];
}) {
  if (neverCollected) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">Ainda não coletamos os dados das suas contas</span>
          <span className="text-xs text-muted-foreground">
            A coleta roda sozinha a cada 15 minutos. Você pode forçar agora se não quiser esperar.
          </span>
        </div>
        <div className="ml-auto">
          <RefreshDataButton />
        </div>
      </div>
    );
  }

  if (failures.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
        <span className="font-medium">
          {failures.length} conta(s) não puderam ser consultadas — os números abaixo podem estar incompletos
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 pl-6">
        {failures.slice(0, 5).map((failure, index) => (
          <li key={`${failure.brandName}-${index}`} className="text-xs text-muted-foreground">
            <span className="font-medium">{failure.brandName}</span> ({failure.platform}) —{" "}
            {failure.errorMessage ?? "erro desconhecido"}
          </li>
        ))}
        {failures.length > 5 ? (
          <li className="text-xs text-muted-foreground">e mais {failures.length - 5} conta(s)…</li>
        ) : null}
      </ul>
    </div>
  );
}
