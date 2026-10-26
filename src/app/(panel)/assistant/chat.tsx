"use client";

import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, chipClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { sendChat } from "./actions";

type Turn = { role: "user" | "assistant"; text: string };

export function Chat({ suggestions, name, disabled }: { suggestions: string[]; name: string; disabled: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    const next = [...turns, { role: "user" as const, text: question }];
    setTurns(next);
    setDraft("");
    setError(null);
    startTransition(async () => {
      const reply = await sendChat(next);
      if (reply.ok) setTurns([...next, { role: "assistant", text: reply.text }]);
      else {
        setError(reply.error);
        setTurns(turns);
        setDraft(question);
      }
    });
  }

  return (
    <Card className="flex min-h-[60vh] flex-col gap-4 p-4 md:p-5">
      <div className="flex-1 space-y-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-lilac text-ink">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">سلام {name}، چه کمکی از دستم برمیاد؟</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" className={chipClass(false)} onClick={() => ask(s)} disabled={disabled || pending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" ? "justify-start" : "justify-end")}>
            <div
              data-testid={t.role === "assistant" ? "assistant-answer" : undefined}
              className={cn(
                "max-w-[85%] animate-rise whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-sm leading-7",
                t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {t.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-end">
            <div className="animate-pulse rounded-3xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">در حال بررسی داده‌ها…</div>
          </div>
        )}
        <div ref={end} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <textarea
          id="assistant-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask(draft);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="سؤالتان را بنویسید…"
          disabled={disabled}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-border bg-muted px-4 py-2.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/70 focus:ring-4 focus:ring-primary/15"
        />
        {turns.length > 0 && (
          <Button type="button" variant="ghost" className="size-11 shrink-0 px-0" title="گفتگوی تازه" onClick={() => setTurns([])} disabled={pending}>
            <RotateCcw className="size-4" />
          </Button>
        )}
        <Button type="submit" className="size-11 shrink-0 px-0" title="بفرست" disabled={disabled || pending || !draft.trim()}>
          <ArrowUp className="size-4" />
        </Button>
      </form>
    </Card>
  );
}
