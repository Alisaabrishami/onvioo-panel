"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm hover:bg-muted print:hidden"
    >
      <Printer className="size-4" />
      چاپ یا PDF
    </button>
  );
}
