import { cn } from "@/lib/utils";

const PALETTE = [
  { bg: "bg-blue-500/10 dark:bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-violet-500/10 dark:bg-violet-500/15", text: "text-violet-600 dark:text-violet-400" },
  { bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" },
  { bg: "bg-amber-500/10 dark:bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  { bg: "bg-rose-500/10 dark:bg-rose-500/15", text: "text-rose-600 dark:text-rose-400" },
  { bg: "bg-cyan-500/10 dark:bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400" },
  { bg: "bg-orange-500/10 dark:bg-orange-500/15", text: "text-orange-600 dark:text-orange-400" },
];

function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  xs: "size-5 rounded-md text-[9px]",
  sm: "size-8 rounded-lg text-xs",
  md: "size-11 rounded-xl text-sm",
  lg: "size-14 rounded-xl text-lg",
} as const;

export function BrandAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const { bg, text } = paletteFor(seed ?? name);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        SIZE_CLASSES[size],
        bg,
        text,
        className
      )}
    >
      {initialsFor(name)}
    </div>
  );
}
