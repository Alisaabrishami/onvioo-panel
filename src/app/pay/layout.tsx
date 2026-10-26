import { Suspense } from "react";

// Pay pages read the invoice per request; the shell around them stays static
export default function PayLayout({ children }: LayoutProps<"/pay">) {
  return <Suspense fallback={<div className="mx-auto max-w-3xl p-4 md:py-10"><div className="skeleton h-96 rounded-3xl" /></div>}>{children}</Suspense>;
}
