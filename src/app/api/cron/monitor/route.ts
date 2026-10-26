import { cronAuthorized } from "@/lib/cron";
import { runFollowUps } from "@/lib/follow-up-run";
import { runMonitors } from "@/lib/monitor-check";

// Every 5 minutes: check every active client site, and let the assistant ask
// about followed tasks that are due a question (it only asks in working hours)
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await runMonitors();
  const asked = await runFollowUps().catch((error) => {
    console.error("[follow-up] failed", error);
    return 0;
  });
  return Response.json({ checked: results.length, down: results.filter((r) => !r.ok).length, followUps: asked });
}
