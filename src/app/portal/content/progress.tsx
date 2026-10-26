import type { ContentStage } from "@/db/schema";
import { STAGES } from "@/lib/content";
import { cn } from "@/lib/utils";

// Client-facing names: the client cares about "waiting for you", not team jargon
export const CLIENT_STAGE_LABELS: Record<ContentStage, string> = {
  idea: "ایده",
  shot: "فیلمبرداری شد",
  editing: "در حال تدوین",
  internal_review: "کنترل کیفیت",
  client_review: "منتظر تأیید شما",
  ready: "آماده انتشار",
  published: "منتشر شد",
};

export function StageProgress({ stage, compact = false }: { stage: ContentStage; compact?: boolean }) {
  const current = STAGES.indexOf(stage);
  return (
    <div>
      <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={STAGES.length} aria-valuenow={current + 1}>
        {STAGES.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < current ? "bg-success" : i === current ? (stage === "client_review" ? "bg-warning" : "bg-primary") : "bg-muted",
            )}
          />
        ))}
      </div>
      {!compact && (
        <div className="mt-2 hidden justify-between text-[11px] text-muted-foreground sm:flex">
          {STAGES.map((s, i) => (
            <span key={s} className={cn(i === current && "font-semibold text-foreground")}>{CLIENT_STAGE_LABELS[s]}</span>
          ))}
        </div>
      )}
    </div>
  );
}
