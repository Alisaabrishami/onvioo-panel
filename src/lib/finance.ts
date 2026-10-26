import type { Direction, FinanceCategory } from "@/db/schema";
import { parseCount, parseDay } from "./growth";
import { toLatinDigits } from "./format";

export const CATEGORY_LABELS: Record<FinanceCategory, string> = {
  client_payment: "دریافتی از مشتری",
  other_income: "درآمد دیگر",
  salary: "حقوق",
  rent: "اجاره",
  bills: "قبوض",
  software: "اشتراک نرم‌افزار و هاست",
  equipment: "تجهیزات",
  ads: "تبلیغات",
  transport: "رفت‌وآمد",
  other_expense: "هزینه‌های جانبی",
  partner_draw: "برداشت شریک",
  partner_contribution: "آورده شریک",
};

export const CATEGORY_DIRECTION: Record<FinanceCategory, Direction> = {
  client_payment: "in",
  other_income: "in",
  partner_contribution: "in",
  salary: "out",
  rent: "out",
  bills: "out",
  software: "out",
  equipment: "out",
  ads: "out",
  transport: "out",
  other_expense: "out",
  partner_draw: "out",
};

export const INCOME_CATEGORIES = ["client_payment", "other_income"] as const satisfies FinanceCategory[];
export const EXPENSE_CATEGORIES = ["salary", "rent", "bills", "software", "equipment", "ads", "transport", "other_expense"] as const satisfies FinanceCategory[];
export const PARTNER_CATEGORIES = ["partner_draw", "partner_contribution"] as const satisfies FinanceCategory[];

export type Tx = { day: string; direction: Direction; amount: number; category: FinanceCategory; partnerId?: string | null };

export function signed(t: Pick<Tx, "direction" | "amount">): number {
  return t.direction === "in" ? t.amount : -t.amount;
}

// Profit and loss: partner money moves cash but is not income or expense
export function profitAndLoss(txs: Tx[]) {
  const byCategory = new Map<FinanceCategory, number>();
  for (const t of txs) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  const income = INCOME_CATEGORIES.reduce((s, c) => s + (byCategory.get(c) ?? 0), 0);
  const expense = EXPENSE_CATEGORIES.reduce((s, c) => s + (byCategory.get(c) ?? 0), 0);
  return { income, expense, profit: income - expense, byCategory };
}

export type PartnerShare = { id: string; shareBp: number; openingBalance: number };

// Each partner's balance: opening + contributions + share of profit − draws
export function partnerBalances(partners: PartnerShare[], txs: Tx[], profit: number) {
  return partners.map((p) => {
    const mine = txs.filter((t) => t.partnerId === p.id);
    const contributed = mine.filter((t) => t.category === "partner_contribution").reduce((s, t) => s + t.amount, 0);
    const drawn = mine.filter((t) => t.category === "partner_draw").reduce((s, t) => s + t.amount, 0);
    const share = Math.round((profit * p.shareBp) / 10000);
    return { id: p.id, contributed, drawn, share, balance: p.openingBalance + contributed + share - drawn };
  });
}

// --- Bank statement import --------------------------------------------

export type BankMapping = {
  date: number;
  description?: number;
  reference?: number;
  balance?: number;
  // Either one signed amount column, or separate withdrawal and deposit columns
  amount?: number;
  debit?: number;
  credit?: number;
  // Iranian banks export rial; the panel keeps toman
  rial: boolean;
};

export type BankLine = { day: string; amount: number; description: string; reference: string | null; balance: number | null };

const BANK_HEADERS: Record<string, string[]> = {
  date: ["تاریخ", "date"],
  description: ["شرح", "توضیحات", "description", "narrative"],
  reference: ["شماره پیگیری", "پیگیری", "شماره سند", "مرجع", "reference", "ref"],
  balance: ["مانده", "موجودی", "balance"],
  debit: ["برداشت", "بدهکار", "debit", "withdrawal"],
  credit: ["واریز", "بستانکار", "credit", "deposit"],
  amount: ["مبلغ", "amount"],
};

// Best guess at the columns from the header row; the user confirms it
export function guessBankMapping(header: string[]): Partial<BankMapping> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = toLatinDigits(h).trim().toLowerCase();
    for (const [field, aliases] of Object.entries(BANK_HEADERS)) {
      if (map[field] === undefined && aliases.some((a) => key.includes(a))) {
        map[field] = i;
        break;
      }
    }
  });
  return map;
}

// "(1,200,000)" or "-1200000" → -1200000
function signedCount(text: string | undefined): number | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  const negative = /^\(.*\)$/.test(t) || /^[-−]/.test(t) || /[-−]$/.test(t);
  const n = parseCount(t.replace(/[()\-−]/g, ""));
  if (n == null || Number.isNaN(n)) return Number.NaN;
  return negative ? -n : n;
}

export function parseBankRows(rows: string[][], m: BankMapping): { lines: BankLine[]; problems: string[] } {
  const lines: BankLine[] = [];
  const problems: string[] = [];
  const div = m.rial ? 10 : 1;
  rows.forEach((r, i) => {
    const line = i + 2;
    const day = parseDay(r[m.date] ?? "");
    if (!day) {
      problems.push(`سطر ${line}: تاریخ نامعتبر`);
      return;
    }
    let amount: number | null;
    if (m.amount !== undefined) amount = signedCount(r[m.amount]);
    else {
      const debit = signedCount(m.debit !== undefined ? r[m.debit] : undefined) ?? 0;
      const credit = signedCount(m.credit !== undefined ? r[m.credit] : undefined) ?? 0;
      amount = Number.isNaN(debit) || Number.isNaN(credit) ? Number.NaN : Math.abs(credit) - Math.abs(debit);
    }
    if (amount == null || Number.isNaN(amount) || amount === 0) {
      problems.push(`سطر ${line}: مبلغ نامعتبر`);
      return;
    }
    const balance = m.balance !== undefined ? signedCount(r[m.balance]) : null;
    lines.push({
      day,
      amount: Math.round(amount / div),
      description: (m.description !== undefined ? r[m.description] : "")?.trim() ?? "",
      reference: (m.reference !== undefined ? r[m.reference]?.trim() : "") || null,
      balance: balance == null || Number.isNaN(balance) ? null : Math.round(balance / div),
    });
  });
  return { lines, problems };
}

export function dedupeKey(l: BankLine): string {
  return [l.day, l.amount, l.reference ?? "", l.description.replace(/\s+/g, " ").slice(0, 80)].join("|");
}

// --- Matching statement lines to panel records --------------------------

export type MatchCandidate = { id: string; day: string; amount: number; direction: Direction; reference: string | null };
export type MatchLine = { id: string; day: string; amount: number; reference: string | null };

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

// Same amount and direction, and the same tracking number or within 3 days;
// each record matches at most one line, nearest date first
export function autoMatch(lines: MatchLine[], txs: MatchCandidate[], maxDays = 3): Map<string, string> {
  const pairs: { line: string; tx: string; score: number }[] = [];
  for (const l of lines) {
    for (const t of txs) {
      if (Math.abs(l.amount) !== t.amount || (l.amount > 0 ? "in" : "out") !== t.direction) continue;
      const sameRef = !!l.reference && !!t.reference && l.reference === t.reference;
      const d = dayDiff(l.day, t.day);
      if (!sameRef && d > maxDays) continue;
      pairs.push({ line: l.id, tx: t.id, score: sameRef ? -1 : d });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  const matched = new Map<string, string>();
  const usedTx = new Set<string>();
  for (const p of pairs) {
    if (matched.has(p.line) || usedTx.has(p.tx)) continue;
    matched.set(p.line, p.tx);
    usedTx.add(p.tx);
  }
  return matched;
}

// Near misses worth a look: same amount within two weeks, or same day within 5%
export function suggestMatches(line: MatchLine, txs: MatchCandidate[]): MatchCandidate[] {
  const dir = line.amount > 0 ? "in" : "out";
  const amt = Math.abs(line.amount);
  return txs
    .filter((t) => t.direction === dir)
    .filter((t) => (t.amount === amt && dayDiff(line.day, t.day) <= 14) || (dayDiff(line.day, t.day) <= 1 && Math.abs(t.amount - amt) / amt <= 0.05))
    .sort((a, b) => dayDiff(line.day, a.day) - dayDiff(line.day, b.day))
    .slice(0, 3);
}

const KEYWORDS: [RegExp, FinanceCategory][] = [
  [/اجاره|rent/i, "rent"],
  [/حقوق|دستمزد|salary|payroll/i, "salary"],
  [/برق|آب|گاز|تلفن|اینترنت|قبض|مخابرات|همراه اول|ایرانسل/i, "bills"],
  [/هاست|دامنه|سرور|اشتراک|آروان|پارس ?پک|ابر|adobe|google|apple/i, "software"],
  [/تبلیغ|اینستاگرام|ads|یکتانت|تپسل/i, "ads"],
  [/اسنپ|تپسی|تاکسی|بنزین|snapp|tapsi/i, "transport"],
  [/دوربین|لنز|میکروفون|نور|دیجی ?کالا|تجهیزات/i, "equipment"],
  [/برداشت شریک|سهم شریک/i, "partner_draw"],
];

// A starting category for an unrecorded bank line; the person confirms it
export function suggestCategory(description: string, amount: number): FinanceCategory {
  for (const [re, cat] of KEYWORDS) if (re.test(description)) return cat;
  return amount > 0 ? "client_payment" : "other_expense";
}
