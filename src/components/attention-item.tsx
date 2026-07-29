import Link from "next/link";
import { TONE_ICON, type StatusTone } from "@/components/status-badge";
import { cn } from "@/lib/utils";

const TONE_ICON_CLASSNAME: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-primary",
  neutral: "text-muted-foreground",
};

export function AttentionItem({
  tone,
  title,
  description,
  href,
}: {
  tone: StatusTone;
  title: string;
  description?: string;
  href: string;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/20"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_ICON_CLASSNAME[tone])} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
      </div>
    </Link>
  );
}
