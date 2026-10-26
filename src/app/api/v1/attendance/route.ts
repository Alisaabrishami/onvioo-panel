import { TEAM, authed } from "@/lib/api/http";
import { openStretch } from "@/lib/team-data";
import { todayMinutes } from "@/lib/team-ops";

export const GET = authed(async (user) => {
  const [stretch, minutes] = await Promise.all([openStretch(user.id), todayMinutes(user.id)]);
  return {
    clockedIn: !!stretch,
    since: stretch?.stretch.clockIn ?? null,
    clientId: stretch?.stretch.clientId ?? null,
    clientName: stretch?.clientName ?? null,
    todayMinutes: minutes,
  };
}, TEAM);
