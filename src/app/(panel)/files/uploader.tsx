"use client";

import { CloudUpload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Select } from "@/components/ui";
import { formatBytes, toPersianDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { completeUpload, startUpload } from "./actions";

type Item = { id: string; name: string; size: number; progress: number; error?: string; done?: boolean };

function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

const KIND_LABELS = { raw: "فایل خام", edit: "نسخه تدوین‌شده", cover: "کاور", other: "سایر" } as const;
type Kind = keyof typeof KIND_LABELS;

export function Uploader({
  clients,
  fixedClientId,
  contentId,
}: {
  clients?: { id: string; name: string }[];
  fixedClientId?: string;
  // Uploading inside a content item: files are tagged with it and a kind
  contentId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [kind, setKind] = useState<Kind>("edit");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function upload(file: File) {
    const id = crypto.randomUUID();
    setItems((prev) => [{ id, name: file.name, size: file.size, progress: 0 }, ...prev]);
    const meta = {
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      clientId: clientId || null,
      ...(contentId && { contentId, kind }),
    };
    const ticket = await startUpload(meta);
    if (!ticket.ok) return update(id, { error: ticket.error });
    try {
      await putWithProgress(ticket.uploadUrl, file, (progress) => update(id, { progress }));
      await completeUpload({ ...meta, key: ticket.key });
      update(id, { progress: 1, done: true });
      router.refresh();
    } catch {
      update(id, { error: "آپلود ناموفق بود؛ اینترنت را بررسی و دوباره امتحان کنید" });
    }
  }

  function handleFiles(list: FileList | null) {
    if (list) Array.from(list).forEach(upload);
  }

  return (
    <div className="space-y-3">
      {contentId && (
        <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="نوع فایل">
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      )}
      {clients && (
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="مشتری">
          <option value="">بدون مشتری (فایل عمومی)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
          dragging && "border-primary bg-primary/5 text-primary",
        )}
      >
        <CloudUpload className="size-8" />
        ریلز، استوری یا هر فایلی را اینجا بکشید یا کلیک کنید
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{it.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(it.size)}</span>
              </div>
              {it.error ? (
                <p className="mt-1 text-xs text-danger">{it.error}</p>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", it.done ? "bg-success" : "bg-primary")}
                      style={{ width: `${Math.round(it.progress * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-left text-xs text-muted-foreground">
                    {it.done ? "✓" : `${toPersianDigits(Math.round(it.progress * 100))}٪`}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
