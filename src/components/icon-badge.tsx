import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string }>;

const COLOR_STYLES = {
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  rose: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
  orange: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
} as const;

export type IconBadgeColor = keyof typeof COLOR_STYLES;

const SIZE_CLASSES = {
  xs: "size-5 rounded-md",
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
} as const;

const ICON_SIZE_CLASSES = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

/**
 * Icone dentro de um tile colorido - generaliza o padrao ja usado em
 * PlatformIconTile (brand-marks.tsx) pra qualquer icone lucide, com uma cor
 * fixa por chamada (nao derivada por hash como o BrandAvatar) pra dar
 * identidade visual consistente a cada secao/feature (ex: Chat sempre verde).
 */
export function IconBadge({
  icon: Icon,
  color = "blue",
  size = "md",
  className,
}: {
  icon: IconComponent;
  color?: IconBadgeColor;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        SIZE_CLASSES[size],
        COLOR_STYLES[color],
        className
      )}
    >
      <Icon className={ICON_SIZE_CLASSES[size]} />
    </div>
  );
}
