import { Sparkles } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import type { ViralScore } from "@/lib/growth-ai";
import { cn } from "@/lib/utils";

const PARTS: { key: keyof ViralScore["parts"]; label: string }[] = [
  { key: "hook", label: "هوک سه ثانیه اول" },
  { key: "caption", label: "کپشن" },
  { key: "hashtags", label: "هشتگ" },
  { key: "timing", label: "زمان انتشار" },
  { key: "trend", label: "هم‌خوانی با ترند" },
];

function tone(score: number) {
  return score >= 70 ? "text-success" : score >= 45 ? "text-warning" : "text-danger";
}

export function ViralScoreCard({
  score,
  scoredAt,
  action,
  enabled,
}: {
  score: ViralScore | null;
  scoredAt: Date | null;
  action: (state: FormState) => Promise<FormState>;
  enabled: boolean;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" />
          امتیاز وایرال
        </h2>
        {score && <span className={cn("text-2xl font-bold", tone(score.score))}>{toPersianDigits(score.score)}<span className="text-sm text-muted-foreground">/۱۰۰</span></span>}
      </div>
      {score ? (
        <div className="space-y-4 text-sm">
          <p className="leading-6">{score.summary}</p>
          <ul className="space-y-1.5">
            {PARTS.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{p.label}</span>
                <span className="h-1.5 flex-1 rounded-full bg-muted">
                  <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${score.parts[p.key] * 10}%` }} />
                </span>
                <span className="w-5 text-left text-xs">{toPersianDigits(score.parts[p.key])}</span>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">پیشنهادها</h3>
            <ol className="list-decimal space-y-1 pr-5 leading-6">
              {score.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">هوک پیشنهادی</h3>
            <p>{score.betterHook}</p>
            <h3 className="mb-1 mt-3 text-xs font-medium text-muted-foreground">کپشن پیشنهادی</h3>
            <p className="whitespace-pre-line leading-6">{score.betterCaption}</p>
          </div>
          {scoredAt && <p className="text-xs text-muted-foreground">بررسی {formatJalaliDateTime(scoredAt)}؛ بعد از تغییر کپشن یا سناریو دوباره بسنجید.</p>}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          {enabled
            ? "قبل از انتشار، هوک، کپشن، هشتگ و زمان انتشار را با آمار همین پیج و رقبا بسنجید."
            : "بعد از تنظیم کلید Claude روی سرور فعال می‌شود."}
        </p>
      )}
      {enabled && (
        <div className="mt-3">
          <ActionButton action={action} pendingLabel="در حال بررسی…" variant={score ? "outline" : "primary"}>
            {score ? "سنجش دوباره" : "سنجش امتیاز"}
          </ActionButton>
        </div>
      )}
    </Card>
  );
}
