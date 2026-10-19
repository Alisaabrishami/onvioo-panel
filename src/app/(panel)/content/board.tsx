"use client";

import { CalendarClock, User } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import type { ContentStage, ContentType } from "@/db/schema";
import { STAGES, STAGE_LABELS, TYPE_LABELS } from "@/lib/content";
import { formatJalaliDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveStage } from "./actions";

export type BoardItem = {
  id: string;
  title: string;
  type: ContentType;
  stage: ContentStage;
  clientName: string;
  assigneeName: string | null;
  dueAt: Date | null;
  publishAt: Date | null;
  comments: number;
  late: boolean;
};

const COLUMN_ACCENT: Record<ContentStage, string> = {
  idea: "border-t-muted-foreground/40",
  shot: "border-t-primary",
  editing: "border-t-warning",
  internal_review: "border-t-warning",
  client_review: "border-t-primary",
  ready: "border-t-success",
  published: "border-t-success",
};

export function Board({ items }: { items: BoardItem[] }) {
  const [optimistic, applyMove] = useOptimistic(items, (state, move: { id: string; stage: ContentStage }) =>
    state.map((it) => (it.id === move.id ? { ...it, stage: move.stage } : it)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<ContentStage | null>(null);
  const [error, setError] = useState(false);

  function move(id: string, stage: ContentStage) {
    const current = optimistic.find((it) => it.id === id);
    if (!current || current.stage === stage) return;
    setError(false);
    startTransition(async () => {
      applyMove({ id, stage });
      const res = await moveStage(id, stage);
      if (!res.ok) setError(true);
    });
  }

  return (
    <>
      {error && <p className="mb-3 text-sm text-danger">جابه‌جایی ذخیره نشد؛ دوباره امتحان کنید.</p>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {STAGES.map((stage) => {
          const cards = optimistic.filter((it) => it.stage === stage);
          return (
            <section
              key={stage}
              data-stage={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/plain"), stage);
              }}
              className={cn(
                "flex w-64 shrink-0 snap-start flex-col rounded-xl border border-t-4 border-border bg-muted/40 p-2 transition-colors",
                COLUMN_ACCENT[stage],
                // On phones, cards move with their stage menu, so empty columns only take up room
                cards.length === 0 && "hidden md:flex",
                over === stage && "bg-primary/10",
              )}
            >
              <h2 className="flex items-center justify-between px-1 py-1.5 text-sm font-semibold">
                {STAGE_LABELS[stage]}
                <span className="rounded-full bg-surface px-2 text-xs text-muted-foreground">
                  {cards.length.toLocaleString("fa-IR")}
                </span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-2">
                {cards.map((it) => {
                  const late = it.late && stage !== "published";
                  return (
                    <li
                      key={it.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
                      className="cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm active:cursor-grabbing"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{it.clientName}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5">{TYPE_LABELS[it.type]}</span>
                      </div>
                      <Link href={`/content/${it.id}`} className="block text-sm font-medium leading-6 hover:text-primary">
                        {it.title}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {it.assigneeName && (
                          <span className="flex items-center gap-1">
                            <User className="size-3" />
                            {it.assigneeName}
                          </span>
                        )}
                        {it.dueAt && stage !== "published" && (
                          <span className={cn("flex items-center gap-1", late && "font-medium text-danger")}>
                            <CalendarClock className="size-3" />
                            {late ? "عقب افتاده · " : "مهلت "}
                            {formatJalaliDate(it.dueAt)}
                          </span>
                        )}
                        {it.publishAt && (stage === "ready" || stage === "published") && (
                          <span>انتشار {formatJalaliDate(it.publishAt)}</span>
                        )}
                      </div>
                      <select
                        aria-label="تغییر مرحله"
                        value={stage}
                        onChange={(e) => move(it.id, e.target.value as ContentStage)}
                        className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs md:hidden"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
