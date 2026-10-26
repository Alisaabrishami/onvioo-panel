import { describe, expect, it } from "vitest";
import { autoMatch, guessBankMapping, parseBankRows, partnerBalances, profitAndLoss, suggestCategory, suggestMatches, type Tx } from "./finance";

describe("profit and loss", () => {
  const txs: Tx[] = [
    { day: "2026-10-01", direction: "in", amount: 50_000_000, category: "client_payment" },
    { day: "2026-10-02", direction: "out", amount: 20_000_000, category: "salary" },
    { day: "2026-10-03", direction: "out", amount: 8_000_000, category: "rent" },
    { day: "2026-10-04", direction: "out", amount: 5_000_000, category: "partner_draw", partnerId: "p1" },
    { day: "2026-10-05", direction: "in", amount: 2_000_000, category: "partner_contribution", partnerId: "p2" },
  ];
  it("leaves partner money out of profit", () => {
    expect(profitAndLoss(txs)).toMatchObject({ income: 50_000_000, expense: 28_000_000, profit: 22_000_000 });
  });
  it("splits profit by share and tracks draws", () => {
    const [a, b] = partnerBalances(
      [
        { id: "p1", shareBp: 6000, openingBalance: 0 },
        { id: "p2", shareBp: 4000, openingBalance: 1_000_000 },
      ],
      txs,
      22_000_000,
    );
    expect(a).toMatchObject({ share: 13_200_000, drawn: 5_000_000, balance: 8_200_000 });
    expect(b).toMatchObject({ share: 8_800_000, contributed: 2_000_000, balance: 11_800_000 });
  });
});

describe("bank statements", () => {
  it("guesses Saman-style Persian headers", () => {
    expect(guessBankMapping(["ردیف", "تاریخ", "شرح", "شماره پیگیری", "برداشت", "واریز", "مانده"])).toEqual({
      date: 1,
      description: 2,
      reference: 3,
      debit: 4,
      credit: 5,
      balance: 6,
    });
  });
  it("parses debit/credit columns in rial into signed toman", () => {
    const { lines, problems } = parseBankRows(
      [
        ["1", "1405/07/20", "واریز مشتری", "123", "", "500,000,000", "900,000,000"],
        ["2", "1405/07/21", "اجاره دفتر", "124", "80,000,000", "", "820,000,000"],
        ["3", "bad", "", "", "", "", ""],
      ],
      { date: 1, description: 2, reference: 3, debit: 4, credit: 5, balance: 6, rial: true },
    );
    expect(lines).toEqual([
      { day: "2026-10-12", amount: 50_000_000, description: "واریز مشتری", reference: "123", balance: 90_000_000 },
      { day: "2026-10-13", amount: -8_000_000, description: "اجاره دفتر", reference: "124", balance: 82_000_000 },
    ]);
    expect(problems).toHaveLength(1);
  });
  it("reads a single signed amount column with parentheses", () => {
    const { lines } = parseBankRows([["2026-10-01", "(1,000)"]], { date: 0, amount: 1, rial: false });
    expect(lines[0].amount).toBe(-1000);
  });
});

describe("matching", () => {
  const txs = [
    { id: "t1", day: "2026-10-10", amount: 1000, direction: "in" as const, reference: null },
    { id: "t2", day: "2026-10-12", amount: 1000, direction: "in" as const, reference: null },
    { id: "t3", day: "2026-10-01", amount: 500, direction: "out" as const, reference: "R9" },
  ];
  it("pairs by amount, direction and nearest date, or by reference", () => {
    const m = autoMatch(
      [
        { id: "l1", day: "2026-10-12", amount: 1000, reference: null },
        { id: "l2", day: "2026-10-11", amount: 1000, reference: null },
        { id: "l3", day: "2026-10-20", amount: -500, reference: "R9" },
        { id: "l4", day: "2026-10-20", amount: 1000, reference: null },
      ],
      txs,
    );
    expect(m.get("l1")).toBe("t2");
    expect(m.get("l2")).toBe("t1");
    expect(m.get("l3")).toBe("t3");
    expect(m.has("l4")).toBe(false);
  });
  it("suggests near misses", () => {
    expect(suggestMatches({ id: "x", day: "2026-10-12", amount: 1030, reference: null }, txs).map((t) => t.id)).toEqual(["t2"]);
  });
  it("guesses categories from descriptions", () => {
    expect(suggestCategory("پرداخت اجاره مهر", -1)).toBe("rent");
    expect(suggestCategory("خرید سرور ابری آروان", -1)).toBe("software");
    expect(suggestCategory("انتقال", 5)).toBe("client_payment");
  });
});
