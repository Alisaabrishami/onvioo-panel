import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { formatToman } from "@/lib/format";
import { appUrl, paymentDriver } from "@/lib/payment";

export const metadata: Metadata = { title: "درگاه آزمایشی", robots: { index: false } };

// Stands in for Zarinpal when PAYMENT_DRIVER=mock, so the whole flow can be tried locally
export default async function MockGateway(props: PageProps<"/pay/mock-gateway">) {
  // Read the request first so the driver check runs per request, not at build
  const sp = await props.searchParams;
  if (paymentDriver() !== "mock") notFound();
  const authority = String(sp.Authority ?? "");
  const callback = String(sp.callback ?? "");
  if (!callback.startsWith(appUrl())) notFound();
  const back = (status: string) => {
    const u = new URL(callback);
    u.searchParams.set("Authority", authority);
    u.searchParams.set("Status", status);
    return u.toString();
  };
  return (
    <main className="mx-auto max-w-md p-4 md:py-16">
      <Card className="space-y-4 text-center">
        <p className="text-xs text-muted-foreground">درگاه آزمایشی (پرداخت واقعی انجام نمی‌شود)</p>
        <p className="text-2xl font-bold">{formatToman(Number(sp.amount ?? 0))}</p>
        <div className="flex gap-2">
          <a href={back("OK")} className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">پرداخت موفق</a>
          <a href={back("NOK")} className="flex h-11 flex-1 items-center justify-center rounded-full border border-border">انصراف</a>
        </div>
      </Card>
    </main>
  );
}
