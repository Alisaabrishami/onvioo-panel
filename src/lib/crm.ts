import type { ActivityKind, LeadSource, LeadStage } from "@/db/schema";

export const LEAD_STAGES: LeadStage[] = ["new", "contacted", "meeting", "proposal", "won", "lost"];
export const OPEN_STAGES: LeadStage[] = ["new", "contacted", "meeting", "proposal"];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "سرنخ تازه",
  contacted: "تماس گرفته شد",
  meeting: "جلسه",
  proposal: "پیشنهاد قیمت",
  won: "قرارداد بسته شد",
  lost: "از دست رفت",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "اینستاگرام",
  referral: "معرفی",
  website: "سایت",
  ads: "تبلیغات",
  other: "سایر",
};

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note: "یادداشت",
  call: "تماس",
  message: "پیام",
  meeting: "جلسه",
  stage: "تغییر مرحله",
};

export type FollowUp = "overdue" | "today" | "soon" | null;

export function followUpState(day: string | null, today: string, stage: LeadStage): FollowUp {
  if (!day || !OPEN_STAGES.includes(stage)) return null;
  if (day < today) return "overdue";
  if (day === today) return "today";
  const diff = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return diff <= 3 ? "soon" : null;
}

type LeadLike = { stage: LeadStage; value: number | null; source: LeadSource; updatedAt: Date };

// Open pipeline value, and win rate over leads that reached a decision
export function pipelineStats(leads: LeadLike[], since: Date) {
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const decided = leads.filter((l) => (l.stage === "won" || l.stage === "lost") && l.updatedAt >= since);
  const won = decided.filter((l) => l.stage === "won");
  const bySource = new Map<LeadSource, { total: number; won: number }>();
  for (const l of leads) {
    const s = bySource.get(l.source) ?? { total: 0, won: 0 };
    bySource.set(l.source, { total: s.total + 1, won: s.won + (l.stage === "won" ? 1 : 0) });
  }
  return {
    open: open.length,
    openValue: open.reduce((s, l) => s + (l.value ?? 0), 0),
    wonCount: won.length,
    wonValue: won.reduce((s, l) => s + (l.value ?? 0), 0),
    winRate: decided.length ? won.length / decided.length : null,
    bySource,
  };
}
