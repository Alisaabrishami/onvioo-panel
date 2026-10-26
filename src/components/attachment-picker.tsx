"use client";

import { Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { finishAttachment, startAttachment } from "@/app/attachment-actions";
import { formatBytes, toPersianDigits } from "@/lib/format";
import { putWithProgress } from "@/lib/put-upload";
import { cn } from "@/lib/utils";

type Item = { local: string; name: string; size: number; progress: number; id?: string; error?: string };

// Files attached to a message: each uploads as soon as it is picked and the
// form submits their ids in hidden `fileIds` fields
export function AttachmentPicker({ clientId, max = 10, onBusyChange }: { clientId?: string | null; max?: number; onBusyChange?: (busy: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = useRef(0);

  const update = (local: string, patch: Partial<Item>) => setItems((prev) => prev.map((it) => (it.local === local ? { ...it, ...patch } : it)));
  const track = (delta: number) => {
    busy.current += delta;
    onBusyChange?.(busy.current > 0);
  };

  async function upload(file: File) {
    const local = crypto.randomUUID();
    setItems((prev) => [...prev, { local, name: file.name, size: file.size, progress: 0 }]);
    track(1);
    try {
      const meta = { name: file.name, size: file.size, mime: file.type || "application/octet-stream", clientId: clientId ?? null };
      const started = await startAttachment(meta);
      if (!started.ok) return update(local, { error: started.error });
      await putWithProgress(started.uploadUrl, file, (progress) => update(local, { progress }));
      const done = await finishAttachment({ ...meta, key: started.key });
      if (!done.ok) return update(local, { error: done.error });
      update(local, { id: done.id, progress: 1 });
    } catch {
      update(local, { error: "آپلود ناموفق بود؛ دوباره امتحان کنید" });
    } finally {
      track(-1);
    }
  }

  const room = max - items.filter((it) => !it.error).length;

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.local} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{it.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(it.size)}</span>
          {it.error ? (
            <span className="shrink-0 text-danger">{it.error}</span>
          ) : it.id ? (
            <span className="shrink-0 text-success">✓</span>
          ) : (
            <span className="w-10 shrink-0 text-left text-muted-foreground">{toPersianDigits(Math.round(it.progress * 100))}٪</span>
          )}
          {(it.id || it.error) && (
            <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.local !== it.local))} aria-label={`حذف ${it.name}`} className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-danger">
              <X className="size-3.5" />
            </button>
          )}
          {it.id && <input type="hidden" name="fileIds" value={it.id} />}
        </div>
      ))}
      <button
        type="button"
        disabled={room <= 0}
        onClick={() => inputRef.current?.click()}
        className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", room <= 0 && "opacity-50")}
      >
        <Paperclip className="size-3.5" />
        پیوست فایل
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="انتخاب فایل پیوست"
        onChange={(e) => {
          Array.from(e.target.files ?? []).slice(0, room).forEach(upload);
          e.target.value = "";
        }}
      />
    </div>
  );
}
