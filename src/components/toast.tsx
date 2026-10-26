"use client";

import { Bell } from "lucide-react";
import { useEffect } from "react";

// A floating message at the bottom of the screen with an optional undo, like
// "#1062 is ready · Undo" in the reference. It closes itself after a few seconds.
export function Toast({
  message,
  onUndo,
  onClose,
  duration = 5000,
}: {
  message: string;
  onUndo?: () => void;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, onClose, duration]);

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] animate-toast items-center gap-3 rounded-full border border-border-strong bg-surface-solid/95 py-1.5 pe-1.5 ps-4 text-sm shadow-card backdrop-blur-xl"
    >
      <Bell className="size-4 shrink-0 animate-ring text-primary" />
      <span className="truncate">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onClose();
          }}
          className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          برگرداندن
        </button>
      )}
    </div>
  );
}
