"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { CommentForm } from "@/components/comment-form";
import { Button } from "@/components/ui";
import type { FormState } from "@/lib/forms";

export function ReviewPanel({
  approve,
  requestChanges,
}: {
  approve: () => Promise<{ ok: boolean }>;
  requestChanges: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <section aria-label="بررسی نسخه" className="rounded-xl border-2 border-warning/40 bg-warning/5 p-4">
      <p className="mb-3 font-semibold">این نسخه را بررسی کنید</p>
      {mode === "choose" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await approve();
                setFailed(!res.ok);
              })
            }
            className="bg-success hover:bg-success/90"
          >
            <CheckCircle2 className="size-4" />
            {pending ? "در حال ثبت…" : "تأیید می‌کنم"}
          </Button>
          <Button variant="outline" onClick={() => setMode("changes")}>
            اصلاحیه دارم
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            بنویسید چه چیزی تغییر کند. اگر درباره لحظه خاصی از ویدیوست، زمانش را هم بنویسید.
          </p>
          <CommentForm action={requestChanges} placeholder="مثلاً: لوگو در ثانیه ۱۵ کوچک است" submitLabel="ارسال اصلاحیه" />
          <button type="button" onClick={() => setMode("choose")} className="mt-2 text-xs text-muted-foreground hover:underline">
            انصراف
          </button>
        </>
      )}
      {failed && <p className="mt-2 text-sm text-danger">ثبت نشد؛ صفحه را تازه کنید و دوباره امتحان کنید.</p>}
    </section>
  );
}
