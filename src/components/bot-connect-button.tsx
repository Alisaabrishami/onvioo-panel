"use client";

import { ExternalLink, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { startChatLink, type LinkStart } from "@/app/bot-actions";

export function ConnectButton({ platform, label }: { platform: string; label: string }) {
  const [state, setState] = useState<LinkStart | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Waits for the person to press Start in the messenger, then shows "connected"
  useEffect(() => {
    if (!state?.code) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [state?.code, router]);

  if (state?.code) {
    return (
      <div className="space-y-2 text-sm">
        {state.url && (
          <a href={state.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 font-medium text-primary-foreground shadow-glow">
            <ExternalLink className="size-4" />
            باز کردن {label} و زدن Start
          </a>
        )}
        <p className="text-muted-foreground">
          {state.url ? "اگر باز نشد، " : ""}این کد را برای ربات بفرستید:
          <code dir="ltr" data-testid="link-code" className="mx-1 rounded-lg bg-muted px-2 py-0.5 font-mono text-foreground select-all">
            {state.code}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">کد تا ۱۵ دقیقه کار می‌کند. بعد از وصل شدن این صفحه خودش به‌روز می‌شود.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => setState(await startChatLink(platform)))}>
        <Link2 className="size-4" />
        {pending ? "در حال ساختن کد…" : `اتصال به ${label}`}
      </Button>
      {state?.error && <p role="status" className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
