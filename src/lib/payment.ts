import "server-only";

// Zarinpal (v4 REST). Amounts are sent in rial; the panel keeps toman.
// PAYMENT_DRIVER=mock serves a local fake gateway for development.

export class PaymentUnavailableError extends Error {}

export function paymentDriver(): "zarinpal" | "mock" | null {
  if (process.env.PAYMENT_DRIVER === "mock") return "mock";
  return process.env.ZARINPAL_MERCHANT_ID ? "zarinpal" : null;
}

function base() {
  return process.env.ZARINPAL_SANDBOX === "1" ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type ZarinpalResponse<T> = { data?: T | []; errors?: { code?: number; message?: string } | [] };

async function call<T>(path: string, body: Record<string, unknown>): Promise<{ data: T | null; code: number | null; message: string | null }> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ merchant_id: process.env.ZARINPAL_MERCHANT_ID, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as ZarinpalResponse<T & { code?: number }>;
  const data = json.data && !Array.isArray(json.data) ? json.data : null;
  const err = json.errors && !Array.isArray(json.errors) ? json.errors : null;
  return { data, code: data?.code ?? err?.code ?? null, message: err?.message ?? null };
}

export async function requestPayment(opts: { amount: number; description: string; callbackUrl: string; mobile?: string | null }): Promise<{ authority: string; url: string }> {
  const driver = paymentDriver();
  if (!driver) throw new PaymentUnavailableError("ZARINPAL_MERCHANT_ID is not set");
  if (driver === "mock") {
    const authority = `MOCK${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const url = new URL(`${appUrl()}/pay/mock-gateway`);
    url.searchParams.set("Authority", authority);
    url.searchParams.set("callback", opts.callbackUrl);
    url.searchParams.set("amount", String(opts.amount));
    return { authority, url: url.toString() };
  }
  const { data, code, message } = await call<{ authority: string }>("/pg/v4/payment/request.json", {
    amount: opts.amount * 10,
    description: opts.description,
    callback_url: opts.callbackUrl,
    metadata: opts.mobile ? { mobile: opts.mobile } : undefined,
  });
  if (code !== 100 || !data?.authority) throw new Error(`Zarinpal request failed: ${code} ${message ?? ""}`);
  return { authority: data.authority, url: `${base()}/pg/StartPay/${data.authority}` };
}

export async function verifyPayment(opts: { amount: number; authority: string }): Promise<{ ok: boolean; refId: string | null; cardPan: string | null; error: string | null }> {
  if (paymentDriver() === "mock") return { ok: true, refId: `R${opts.authority.slice(-8)}`, cardPan: "6219-86**-****-1234", error: null };
  const { data, code, message } = await call<{ ref_id?: number; card_pan?: string }>("/pg/v4/payment/verify.json", {
    amount: opts.amount * 10,
    authority: opts.authority,
  });
  // 101 means this payment was already verified, which still counts as paid
  if (code === 100 || code === 101) return { ok: true, refId: data?.ref_id ? String(data.ref_id) : null, cardPan: data?.card_pan ?? null, error: null };
  return { ok: false, refId: null, cardPan: null, error: `${code ?? "?"} ${message ?? ""}`.trim() };
}
