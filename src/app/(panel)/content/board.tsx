"use client";

import { ArrowLeft, CalendarClock, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import { Toast } from "@/components/toast";
import { toneClasses, type Tone } from "@/components/ui";
import type { ContentStage, ContentType } from "@/db/schema";
import { STAGES, STAGE_LABELS, TYPE_LABELS } from "@/lib/content";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
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

// Cards take the pastel of their stage; ideas and published work stay on glass
const STAGE_TONE: Record<ContentStage, Tone | null> = {
  idea: null,
  shot: "sky",
  editing: "sand",
  internal_review: "coral",
  client_review: "lilac",
  ready: "mint",
  published: null,
};

const DOT: Record<ContentStage, string> = {
  idea: "bg-muted-foreground",
  shot: "bg-sky",
  editing: "bg-sand",
  internal_review: "bg-coral",
  client_review: "bg-lilac",
  ready: "bg-mint",
  published: "bg-muted-foreground/60",
};

export function Board({ items }: { items: BoardItem[] }) {
  const [optimistic, applyMove] = useOptimistic(items, (state, move: { id: string; stage: ContentStage }) =>
    state.map((it) => (it.id === move.id ? { ...it, stage: move.stage } : it)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<ContentStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  function commit(id: string, stage: ContentStage, onSaved?: () => void) {
    setError(false);
    startTransition(async () => {
      applyMove({ id, stage });
      const res = await moveStage(id, stage);
      if (!res.ok) setError(true);
      else onSaved?.();
    });
  }

  function move(id: string, stage: ContentStage) {
    const current = optimistic.find((it) => it.id === id);
    if (!current || current.stage === stage) return;
    const from = current.stage;
    commit(id, stage, () =>
      setToast({ message: `«${current.title}» ← ${STAGE_LABELS[stage]}`, undo: () => commit(id, from) }),
    );
  }

  return (
    <>
      {error && <p className="mb-3 animate-fade text-sm text-danger">جابه‌جایی ذخیره نشد؛ دوباره امتحان کنید.</p>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {STAGES.map((stage, col) => {
          const cards = optimistic.filter((it) => it.stage === stage);
          const tone = STAGE_TONE[stage];
          const next = STAGES[STAGES.indexOf(stage) + 1];
          return (
            <section
              key={stage}
              data-stage={stage}
              style={{ "--i": col } as React.CSSProperties}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                // The card remounts in its new column, so its own dragend never fires
                setDragging(null);
                move(e.dataTransfer.getData("text/plain"), stage);
              }}
              className={cn(
                "glass flex w-72 shrink-0 animate-rise snap-start flex-col rounded-[28px] p-2.5 transition-[background-color,box-shadow,border-color] duration-300 [animation-delay:calc(var(--i)*60ms)]",
                // On phones, cards move with their stage menu, so empty columns only take up room
                cards.length === 0 && "hidden md:flex",
                over === stage && "border-primary/60 bg-primary/10 ring-4 ring-primary/15",
              )}
            >
              <h2 className="flex items-center gap-2 px-2 pt-1 pb-2.5 text-sm font-semibold">
                <span className={cn("size-2.5 rounded-full", DOT[stage])} />
                {STAGE_LABELS[stage]}
                <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                  {toPersianDigits(cards.length)}
                </span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-2.5">
                {cards.map((it, i) => {
                  const late = it.late && stage !== "published";
                  return (
                    <li
                      key={it.id}
                      draggable
                      style={{ "--i": i } as React.CSSProperties}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", it.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(it.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "group animate-pop cursor-grab rounded-3xl p-3.5 shadow-card transition-[transform,opacity,box-shadow] duration-300 ease-spring [animation-delay:calc(var(--i)*40ms)] hover:-translate-y-1 hover:shadow-[0_22px_40px_-20px_rgba(0,0,0,0.6)] active:cursor-grabbing",
                        tone ? toneClasses[tone] : "border border-border bg-surface-raised",
                        stage === "published" && "opacity-75",
                        dragging === it.id && "scale-95 rotate-1 opacity-40",
                      )}
                    >
                      <div className="mb-2 flex items-center gap-1.5 text-xs">
                        <span className={cn("rounded-full px-2 py-0.5 font-semibold", tone ? "bg-white/60" : "bg-muted text-muted-foreground")}>
                          {TYPE_LABELS[it.type]}
                        </span>
                        {late && (
                          <span className="animate-pop rounded-full bg-ink px-2 py-0.5 font-semibold text-white">عقب افتاده</span>
                        )}
                      </div>
                      <Link href={`/content/${it.id}`} className="block text-[15px] font-bold leading-6 hover:underline">
                        {it.title}
                      </Link>
                      <div
                        className={cn(
                          "mt-2.5 space-y-1 rounded-2xl px-3 py-2 text-xs",
                          tone ? "bg-white/35 text-ink/80" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <p className="truncate font-medium">{it.clientName}</p>
                        {it.assigneeName && (
                          <p className="flex items-center gap-1">
                            <User className="size-3" />
                            {it.assigneeName}
                          </p>
                        )}
                        {it.dueAt && stage !== "published" && (
                          <p className={cn("flex items-center gap-1", late && "font-semibold")}>
                            <CalendarClock className="size-3" />
                            مهلت {formatJalaliDate(it.dueAt)}
                          </p>
                        )}
                        {it.publishAt && (stage === "ready" || stage === "published") && (
                          <p>انتشار {formatJalaliDate(it.publishAt)}</p>
                        )}
                      </div>
                      {next && (
                        <button
                          type="button"
                          onClick={() => move(it.id, next)}
                          className={cn(
                            "mt-2.5 hidden items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-card transition-[transform,background-color] duration-200 active:scale-95 md:inline-flex",
                            tone ? "bg-white text-ink hover:bg-white/85" : "bg-muted hover:bg-border-strong",
                          )}
                        >
                          {STAGE_LABELS[next]}
                          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                        </button>
                      )}
                      <select
                        aria-label="تغییر مرحله"
                        value={stage}
                        onChange={(e) => move(it.id, e.target.value as ContentStage)}
                        className={cn(
                          "mt-2.5 w-full rounded-full px-3 py-1.5 text-xs md:hidden",
                          tone ? "bg-white/60 text-ink" : "border border-border bg-muted [&>option]:bg-surface-solid",
                        )}
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
      {toast && <Toast message={toast.message} onUndo={toast.undo} onClose={closeToast} />}
    </>
  );
}
