"use client";

import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleChecklistItem } from "../actions";

export function Checklist({ shootId, text }: { shootId: string; text: string }) {
  const [lines, toggle] = useOptimistic(text.split("\n"), (state, index: number) =>
    state.map((l, i) => (i === index ? (l.startsWith("x ") ? l.slice(2) : `x ${l}`) : l)),
  );
  const [, startTransition] = useTransition();
  return (
    <ul className="space-y-1.5 text-sm">
      {lines.map((line, i) => {
        if (!line.trim()) return null;
        const done = line.startsWith("x ");
        return (
          <li key={i}>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={done}
                onChange={() =>
                  startTransition(async () => {
                    toggle(i);
                    await toggleChecklistItem(shootId, i);
                  })
                }
                className="size-4 accent-[var(--color-primary)]"
              />
              <span className={cn(done && "text-muted-foreground line-through")}>{done ? line.slice(2) : line}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
