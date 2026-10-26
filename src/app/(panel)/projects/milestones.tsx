"use client";

import { Trash2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import { deleteMilestone, toggleMilestone } from "./actions";

type Milestone = { id: string; title: string; done: boolean };

export function Milestones({ items }: { items: Milestone[] }) {
  const [list, apply] = useOptimistic(items, (state, change: { id: string; done?: boolean; remove?: boolean }) =>
    change.remove ? state.filter((m) => m.id !== change.id) : state.map((m) => (m.id === change.id ? { ...m, done: !!change.done } : m)),
  );
  const [, startTransition] = useTransition();
  if (list.length === 0) return <p className="text-sm text-muted-foreground">هنوز مرحله‌ای تعریف نشده است.</p>;
  return (
    <ul className="space-y-1">
      {list.map((m) => (
        <li key={m.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/50">
          <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={m.done}
              onChange={(e) => {
                const done = e.target.checked;
                startTransition(async () => {
                  apply({ id: m.id, done });
                  await toggleMilestone(m.id, done);
                });
              }}
              className="size-4"
            />
            <span className={cn(m.done && "text-muted-foreground line-through")}>{m.title}</span>
          </label>
          <button
            type="button"
            aria-label="حذف مرحله"
            onClick={() =>
              startTransition(async () => {
                apply({ id: m.id, remove: true });
                await deleteMilestone(m.id);
              })
            }
            className="invisible rounded p-1 text-muted-foreground hover:text-danger group-hover:visible"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
