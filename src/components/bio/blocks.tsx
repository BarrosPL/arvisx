import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import type { BioBlock } from "@/generated/prisma/client";
import type { LeadFormField } from "@/lib/content/schema";
import { LeadFormBlock } from "./lead-form-block";
import { CountdownBlock } from "./countdown-block";

/**
 * Renderizadores dos blocos da bio page publica - 100% server component, Tailwind puro,
 * SEM client boundary nenhum (o unico client island da pagina publica e
 * bio-page-client.tsx, pro consentimento/tracking/submit). Nunca importar nada de
 * src/components/* (arvore do editor autenticado, que arrasta Base UI/shadcn) - e o
 * maior risco real de estourar o orcamento de JS da pagina publica.
 *
 * `data-block-id` nos elementos clicaveis - o tracking (tracking.tsx, fatia 8) le isso
 * por delegacao de evento num listener SO, sem precisar de handler React por link
 * (o que exigiria virar client component).
 */

function LinkBlock({ blockId, config }: { blockId: string; config: { label: string; url: string; style?: string; highlight?: boolean } }) {
  return (
    <a
      href={config.url}
      target="_blank"
      rel="noreferrer"
      data-block-id={blockId}
      className={cn(
        "flex w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-medium transition-colors",
        config.style === "outline" && "border-current bg-transparent",
        config.style === "filled" && "border-transparent bg-foreground text-background",
        (!config.style || config.style === "default") && "border-black/10 bg-white/90 text-black hover:bg-white",
        config.highlight && "ring-2 ring-offset-2"
      )}
    >
      {config.label}
    </a>
  );
}

function WhatsappBlock({ blockId, config }: { blockId: string; config: { phone: string; prefilledMessage?: string } }) {
  const digits = config.phone.replace(/\D/g, "");
  const href = config.prefilledMessage
    ? `https://wa.me/${digits}?text=${encodeURIComponent(config.prefilledMessage)}`
    : `https://wa.me/${digits}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-block-id={blockId}
      className="flex w-full items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
    >
      Chamar no WhatsApp
    </a>
  );
}

function TextBlock({ config }: { config: { markdown: string } }) {
  // Texto simples com quebras de linha preservadas - parser de markdown de verdade
  // (com sanitizacao contra XSS) fica pra quando fizer falta, sem adicionar dependencia
  // nova so por isso agora.
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{config.markdown}</p>;
}

function ImageBlock({ blockId, config }: { blockId: string; config: { assetId: string; alt: string; linkUrl?: string } }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/public/media/${config.assetId}`}
      alt={config.alt}
      loading="lazy"
      className="w-full rounded-xl object-cover"
    />
  );
  return config.linkUrl ? (
    <a href={config.linkUrl} target="_blank" rel="noreferrer" data-block-id={blockId}>
      {img}
    </a>
  ) : (
    img
  );
}

function SocialIconsBlock({ blockId, config }: { blockId: string; config: { networks: { network: string; url: string }[] } }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {config.networks.map((entry) => (
        <a
          key={entry.network + entry.url}
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          data-block-id={blockId}
          className="rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-white"
        >
          {entry.network}
        </a>
      ))}
    </div>
  );
}

function DividerBlock({ config }: { config: { style?: string } }) {
  if (config.style === "space") return <div className="h-6" />;
  return <hr className="border-black/10" />;
}

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

function vimeoEmbedUrl(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? `https://player.vimeo.com/video/${match[1]}` : null;
}

function VideoBlock({ config }: { config: { provider: "youtube" | "vimeo" | "direct"; url: string; autoplay?: boolean } }) {
  if (config.provider === "direct") {
    return <video src={config.url} controls autoPlay={config.autoplay} muted={config.autoplay} className="w-full rounded-xl" />;
  }

  const embedUrl = config.provider === "youtube" ? youtubeEmbedUrl(config.url) : vimeoEmbedUrl(config.url);
  if (!embedUrl) return null;

  const src = config.autoplay ? `${embedUrl}?autoplay=1&mute=1` : embedUrl;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl">
      <iframe src={src} className="size-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Vídeo" />
    </div>
  );
}

function FaqBlock({ config }: { config: { items: { q: string; a: string }[] } }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {config.items.map((item, index) => (
        // <details>/<summary> nativo - accordion sem JS nenhum.
        <details key={index} className="rounded-xl border border-black/10 bg-white/90 p-3 text-black">
          <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
          <p className="mt-2 text-sm text-black/70">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

function ProductCardBlock({
  blockId,
  config,
}: {
  blockId: string;
  config: { title: string; price: string; image: string; ctaUrl: string };
}) {
  return (
    <a
      href={config.ctaUrl}
      target="_blank"
      rel="noreferrer"
      data-block-id={blockId}
      className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white/90 p-3 text-black"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={config.image} alt={config.title} loading="lazy" className="size-16 shrink-0 rounded-lg object-cover" />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{config.title}</span>
        <span className="text-sm text-black/70">{config.price}</span>
      </div>
    </a>
  );
}

function CalendarEmbedBlock({ config }: { config: { provider: string; url: string } }) {
  return (
    <div className="h-[480px] w-full overflow-hidden rounded-xl">
      <iframe src={config.url} className="size-full" title="Agenda" />
    </div>
  );
}

/** Unico tipo cujo renderer precisa buscar dado extra (o LeadForm referenciado) -
 * por isso BioBlockRenderer e async, os demais tipos usam so o proprio block.config. */
async function LeadFormBlockServer({ config }: { config: { leadFormId: string; buttonLabel: string } }) {
  const leadForm = await prisma.leadForm.findUnique({ where: { id: config.leadFormId } });
  if (!leadForm || !leadForm.isActive) return null;

  return (
    <LeadFormBlock
      leadFormId={leadForm.id}
      buttonLabel={config.buttonLabel}
      fields={leadForm.fields as unknown as LeadFormField[]}
      consentText={leadForm.consentText}
      consentRequired={leadForm.consentRequired}
      privacyPolicyUrl={leadForm.privacyPolicyUrl}
    />
  );
}

export async function BioBlockRenderer({ block }: { block: BioBlock }) {
  const config = block.config as Record<string, unknown>;
  switch (block.type) {
    case "LINK":
      return <LinkBlock blockId={block.id} config={config as never} />;
    case "WHATSAPP":
      return <WhatsappBlock blockId={block.id} config={config as never} />;
    case "TEXT":
      return <TextBlock config={config as never} />;
    case "IMAGE":
      return <ImageBlock blockId={block.id} config={config as never} />;
    case "SOCIAL_ICONS":
      return <SocialIconsBlock blockId={block.id} config={config as never} />;
    case "DIVIDER":
      return <DividerBlock config={config as never} />;
    case "LEAD_FORM":
      return <LeadFormBlockServer config={config as never} />;
    case "VIDEO":
      return <VideoBlock config={config as never} />;
    case "FAQ":
      return <FaqBlock config={config as never} />;
    case "COUNTDOWN":
      return <CountdownBlock {...(config as { targetAt: string; label: string; onExpire: "hide" | "keep" | "message" })} />;
    case "PRODUCT_CARD":
      return <ProductCardBlock blockId={block.id} config={config as never} />;
    case "CALENDAR_EMBED":
      return <CalendarEmbedBlock config={config as never} />;
    default:
      return null;
  }
}
