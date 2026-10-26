"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import type { Segment } from "@/db/schema";
import { formatTimecode } from "@/lib/content";
import { cn } from "@/lib/utils";
import { saveTranscript } from "../../../video-actions";

export const PLAYER_ID = "studio-player";

function player(): HTMLVideoElement | null {
  return document.getElementById(PLAYER_ID) as HTMLVideoElement | null;
}

// Refreshes the page while a job is queued or running, so its result shows up on its own
export function JobWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

type Row = { start: string; end: string; text: string };
const toRow = (s: Segment): Row => ({ start: s.start.toFixed(1), end: s.end.toFixed(1), text: s.text });

export function TranscriptEditor({ fileId, segments }: { fileId: string; segments: Segment[] }) {
  const [rows, setRows] = useState<Row[]>(() => segments.map(toRow));
  const [current, setCurrent] = useState(-1);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const list = useRef<HTMLOListElement>(null);

  // Follows the video: the line being spoken is highlighted
  useEffect(() => {
    const v = player();
    if (!v) return;
    const onTime = () => setCurrent(rows.findIndex((r) => v.currentTime >= Number(r.start) && v.currentTime < Number(r.end)));
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [rows]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function addAfter(i: number) {
    setRows((rs) => {
      const prev = rs[i];
      const start = prev ? Number(prev.end) : 0;
      const next = { start: start.toFixed(1), end: (start + 2).toFixed(1), text: "" };
      return [...rs.slice(0, i + 1), next, ...rs.slice(i + 1)];
    });
    setDirty(true);
  }

  function seek(i: number) {
    const v = player();
    if (!v) return;
    v.currentTime = Number(rows[i].start) + 0.01;
    void v.play().catch(() => {});
  }

  function save() {
    const payload = rows.map((r) => ({ start: Number(r.start), end: Number(r.end), text: r.text }));
    startTransition(async () => {
      const res = await saveTranscript(fileId, payload);
      setMessage({ ok: res.ok, text: res.message ?? "" });
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <ol ref={list} className="max-h-[60vh] space-y-2 overflow-y-auto pe-1" aria-label="خط‌های زیرنویس">
        {rows.map((r, i) => (
          <li
            key={i}
            className={cn("group rounded-2xl border p-2.5 transition-colors", i === current ? "border-primary/60 bg-primary/10" : "border-border bg-muted/40")}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <button type="button" onClick={() => seek(i)} className="ltr rounded-full bg-surface px-2 py-0.5 font-medium text-primary hover:bg-primary/15" title="پخش از اینجا">
                {formatTimecode(Math.floor(Number(r.start) || 0))}
              </button>
              <label className="flex items-center gap-1">
                از
                <Input value={r.start} onChange={(e) => update(i, { start: e.target.value })} inputMode="decimal" dir="ltr" className="h-7 w-16 px-2 text-xs" aria-label="شروع (ثانیه)" />
              </label>
              <label className="flex items-center gap-1">
                تا
                <Input value={r.end} onChange={(e) => update(i, { end: e.target.value })} inputMode="decimal" dir="ltr" className="h-7 w-16 px-2 text-xs" aria-label="پایان (ثانیه)" />
              </label>
              <span className="ms-auto flex gap-1 opacity-60 group-hover:opacity-100">
                <button type="button" onClick={() => addAfter(i)} className="rounded-full p-1 hover:bg-muted hover:text-foreground" title="خط تازه بعد از این">
                  <Plus className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows((rs) => rs.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  className="rounded-full p-1 hover:bg-muted hover:text-danger"
                  title="حذف خط"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
            <Input value={r.text} onChange={(e) => update(i, { text: e.target.value })} aria-label={`متن خط ${i + 1}`} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          <Save className="size-4" />
          {pending ? "در حال ذخیره…" : "ذخیره زیرنویس"}
        </Button>
        {rows.length === 0 && (
          <Button type="button" variant="ghost" onClick={() => addAfter(-1)}>
            <Plus className="size-4" />
            خط تازه
          </Button>
        )}
        {dirty && <span className="text-xs text-warning">تغییرات ذخیره نشده</span>}
        {message && !dirty && <span role="status" className={message.ok ? "text-xs text-success" : "text-xs text-danger"}>{message.text}</span>}
      </div>
    </div>
  );
}

// Plays a suggested clip's range in the player
export function PreviewButton({ start, end }: { start: number; end: number }) {
  return (
    <button
      type="button"
      className="ltr rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
      onClick={() => {
        const v = player();
        if (!v) return;
        v.currentTime = start;
        void v.play().catch(() => {});
        const stop = () => {
          if (v.currentTime >= end) {
            v.pause();
            v.removeEventListener("timeupdate", stop);
          }
        };
        v.addEventListener("timeupdate", stop);
      }}
    >
      ▶ {formatTimecode(Math.floor(start))} – {formatTimecode(Math.ceil(end))}
    </button>
  );
}
