import { describe, expect, it } from "vitest";
import { followUpState, pipelineStats } from "./crm";
import { invoiceTotals, isOverdue, readItems } from "./invoice";
import { normalizeUrl, transition, uptime } from "./monitor";

describe("invoice", () => {
  it("applies discount before VAT", () => {
    const t = invoiceTotals([{ title: "ریلز", qty: 4, unitPrice: 2_500_000 }, { title: "سئو", qty: 1, unitPrice: 5_000_000 }], 1_000_000, 1000);
    expect(t).toEqual({ subtotal: 15_000_000, taxable: 14_000_000, tax: 1_400_000, total: 15_400_000 });
  });
  it("reads form rows and rejects bad ones", () => {
    expect(readItems(["پکیج", "", ""], [1, null, null], [9_000_000, null, null])).toEqual([{ title: "پکیج", qty: 1, unitPrice: 9_000_000 }]);
    expect(readItems(["پکیج"], [1], [0])).toBe("ردیف 1: مبلغ نامعتبر");
    expect(readItems([""], [null], [null])).toBe("حداقل یک ردیف لازم است");
  });
  it("is overdue only when sent and past due", () => {
    expect(isOverdue({ status: "sent", dueOn: "2026-10-01" }, "2026-10-19")).toBe(true);
    expect(isOverdue({ status: "paid", dueOn: "2026-10-01" }, "2026-10-19")).toBe(false);
    expect(isOverdue({ status: "sent", dueOn: "2026-10-19" }, "2026-10-19")).toBe(false);
  });
});

describe("crm", () => {
  it("flags follow-ups", () => {
    expect(followUpState("2026-10-18", "2026-10-19", "contacted")).toBe("overdue");
    expect(followUpState("2026-10-19", "2026-10-19", "new")).toBe("today");
    expect(followUpState("2026-10-21", "2026-10-19", "meeting")).toBe("soon");
    expect(followUpState("2026-10-18", "2026-10-19", "won")).toBeNull();
  });
  it("computes pipeline value and win rate", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const s = pipelineStats(
      [
        { stage: "new", value: 10, source: "instagram", updatedAt: now },
        { stage: "proposal", value: 20, source: "referral", updatedAt: now },
        { stage: "won", value: 30, source: "referral", updatedAt: now },
        { stage: "lost", value: 40, source: "instagram", updatedAt: now },
        { stage: "won", value: 50, source: "ads", updatedAt: new Date("2026-01-01") },
      ],
      new Date("2026-09-23"),
    );
    expect(s.openValue).toBe(30);
    expect(s.winRate).toBe(0.5);
    expect(s.bySource.get("referral")).toEqual({ total: 2, won: 1 });
  });
});

describe("monitor", () => {
  it("normalizes urls", () => {
    expect(normalizeUrl("cafe-sample.ir")).toBe("https://cafe-sample.ir/");
    expect(normalizeUrl("http://a.ir/x")).toBe("http://a.ir/x");
    expect(normalizeUrl("not a site")).toBeNull();
  });
  it("needs two failures to call a site down", () => {
    expect(transition(true, [{ ok: false }, { ok: true }])).toBeNull();
    expect(transition(true, [{ ok: false }, { ok: false }])).toBe("down");
    expect(transition(false, [{ ok: false }, { ok: false }])).toBeNull();
    expect(transition(false, [{ ok: true }, { ok: false }])).toBe("up");
    expect(transition(null, [{ ok: true }])).toBeNull();
  });
  it("computes uptime", () => {
    expect(uptime([{ ok: true }, { ok: true }, { ok: false }, { ok: true }])).toBe(0.75);
    expect(uptime([])).toBeNull();
  });
});
