"use client";

import { Paperclip, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { attachReceipt, removeReceipt, startReceiptUpload } from "./actions";

// Receipt of one transaction: a link when there is one, otherwise a button to
// pick a photo (on a phone this opens the camera) or a PDF
export function ReceiptCell({ transactionId, fileId }: { transactionId: string; fileId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");

  async function upload(file: File) {
    setState("uploading");
    const meta = { name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
    const ticket = await startReceiptUpload(transactionId, meta);
    if (!ticket.ok) {
      setError(ticket.error);
      return setState("error");
    }
    const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": meta.mime }, body: file }).catch(() => null);
    if (!put?.ok || !(await attachReceipt(transactionId, { ...meta, key: ticket.key })).ok) {
      setError("آپلود ناموفق بود");
      return setState("error");
    }
    setState("idle");
    router.refresh();
  }

  if (fileId) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <a href={`/files/${fileId}/download`} target="_blank" rel="noreferrer" className="rounded p-1 text-primary hover:bg-primary/10" title="دیدن رسید" aria-label="دیدن رسید">
          <Paperclip className="size-4" />
        </a>
        <form action={removeReceipt.bind(null, transactionId)}>
          <button type="submit" className="rounded p-1 text-muted-foreground hover:text-danger" title="برداشتن رسید" aria-label="برداشتن رسید">
            <X className="size-3.5" />
          </button>
        </form>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center">
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label="فایل رسید"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state === "uploading"}
        className="rounded p-1 text-muted-foreground hover:text-primary disabled:animate-pulse"
        title={state === "error" ? error : "افزودن عکس رسید"}
        aria-label="افزودن عکس رسید"
      >
        <Upload className={state === "error" ? "size-4 text-danger" : "size-4"} />
      </button>
    </span>
  );
}
