import { cronAuthorized } from "@/lib/cron";
import { syncAll } from "@/lib/growth-data";

// Daily: followers, page insights and recent posts of connected pages, and competitors' public numbers
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncAll();
  return Response.json({
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).map((r) => ({ username: r.username, error: r.error })),
    spikes: results.reduce((s, r) => s + (r.spikes ?? 0), 0),
  });
}
