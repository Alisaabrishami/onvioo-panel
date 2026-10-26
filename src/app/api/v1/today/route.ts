import { STAGE_LABELS } from "@/lib/content";
import { TEAM, authed } from "@/lib/api/http";
import { todayMinutes, todayPlan } from "@/lib/team-ops";

// The home screen of the team app: today's shoots, due tasks and content, and the clock
export const GET = authed(async (user) => {
  const now = new Date();
  const [plan, minutes] = await Promise.all([todayPlan(user.id, now), todayMinutes(user.id, now)]);
  const late = (d: Date | null) => !!d && d < plan.dayStart;
  return {
    shoots: plan.shoots,
    tasks: plan.tasks.map((t) => ({ ...t, late: late(t.dueAt) })),
    contents: plan.contents.map((c) => ({ ...c, stageLabel: STAGE_LABELS[c.stage], late: late(c.dueAt) })),
    attendance: {
      clockedIn: !!plan.stretch,
      since: plan.stretch?.stretch.clockIn ?? null,
      clientId: plan.stretch?.stretch.clientId ?? null,
      clientName: plan.stretch?.clientName ?? null,
      todayMinutes: minutes,
    },
  };
}, TEAM);
