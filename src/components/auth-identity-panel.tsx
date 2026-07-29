/**
 * Lado de identidade da tela de login - estatico, so CSS/icones (sem imagem externa).
 * Compacto no mobile (empilha antes do formulario), completo no desktop (lg:).
 */
export function AuthIdentityPanel() {
  return (
    <div className="relative flex w-full flex-col justify-center gap-6 overflow-hidden bg-foreground px-6 py-8 text-background sm:px-8 lg:w-[44%] lg:justify-between lg:gap-0 lg:px-12 lg:py-14">
      <div
        aria-hidden
        className="ai-gradient-bg pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-25 blur-3xl"
      />
      <div
        aria-hidden
        className="ai-gradient-bg pointer-events-none absolute -bottom-32 -left-16 hidden size-72 rounded-full opacity-10 blur-3xl lg:block"
      />

      <div className="relative flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-background text-xs font-semibold text-foreground lg:size-8 lg:text-sm">
          A
        </div>
        <span className="text-sm font-semibold tracking-tight lg:text-base">ARVISX</span>
      </div>

      <div className="relative flex flex-col gap-2 lg:gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-balance lg:text-3xl">
          Inteligência que transforma dados de mídia em decisões.
        </h1>
        <p className="text-sm text-background/70 text-pretty lg:text-base">
          Analise campanhas, identifique oportunidades e aprove ações com segurança em uma única
          central.
        </p>
      </div>

      <p className="relative hidden text-xs text-background/50 lg:block">
        Meta Ads · Google Ads · JAMILE
      </p>
    </div>
  );
}
