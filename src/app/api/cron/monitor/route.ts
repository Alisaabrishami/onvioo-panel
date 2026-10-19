import { cronAuthorized } from "@/lib/cron";
import { runMonitors } from "@/lib/monitor-check";

// Every 5 minutes: check every active client site
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await runMonitors();
  return Response.json({ checked: results.length, down: results.filter((r) => !r.ok).length });
}
