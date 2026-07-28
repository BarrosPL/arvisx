import { SiMeta, SiGoogleads } from "react-icons/si";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  className?: string;
}

/** Logo oficial da Meta (simple-icons), monocromático via currentColor. */
export function MetaMark({ className }: PlatformIconProps) {
  return <SiMeta className={cn("size-4", className)} />;
}

/** Logo oficial do Google Ads (simple-icons), monocromático via currentColor. */
export function GoogleAdsMark({ className }: PlatformIconProps) {
  return <SiGoogleads className={cn("size-4", className)} />;
}

const PLATFORM_STYLES = {
  META: {
    Icon: MetaMark,
    bg: "bg-[#0866FF]/10 text-[#0866FF] dark:bg-[#0866FF]/15",
  },
  GOOGLE: {
    Icon: GoogleAdsMark,
    bg: "bg-[#FBBC04]/15 text-[#EA8600] dark:bg-[#FBBC04]/20 dark:text-[#FBBC04]",
  },
} as const;

/** Ícone da plataforma dentro de um tile circular colorido, no padrão dos cards de conexão. */
export function PlatformIconTile({
  platform,
  size = "md",
}: {
  platform: "META" | "GOOGLE";
  size?: "sm" | "md" | "lg";
}) {
  const { Icon, bg } = PLATFORM_STYLES[platform];
  const sizeClass = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10";
  const iconSize = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-5";

  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-xl", sizeClass, bg)}>
      <Icon className={iconSize} />
    </div>
  );
}
