"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import type { ContentStage } from "@/db/schema";
import { STAGES, STAGE_LABELS } from "@/lib/content";
import { cn } from "@/lib/utils";
import { moveStage } from "../actions";

// The pipeline as a row of steps; clicking one moves the content there
export function StagePicker({ contentId, stage }: { contentId: string; stage: ContentStage }) {
  const [pending, startTransition] = useTransition();
  const current = STAGES.indexOf(stage);
  return (
    <ol className={cn("flex flex-wrap gap-1.5", pending && "opacity-60")}>
      {STAGES.map((s, i) => (
        <li key={s}>
          <button
            type="button"
            disabled={pending || s === stage}
            onClick={() => startTransition(async () => void (await moveStage(contentId, s)))}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              s === stage
                ? "border-primary bg-primary text-primary-foreground"
                : i < current
                  ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {i < current && <Check className="size-3" />}
            {STAGE_LABELS[s]}
          </button>
        </li>
      ))}
    </ol>
  );
}
