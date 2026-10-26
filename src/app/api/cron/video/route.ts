import { cronAuthorized } from "@/lib/cron";
import { runVideoJobs } from "@/lib/video-jobs";

// Every minute: a safety net for video jobs (subtitles, clips) that were
// queued while the server restarted, or that failed once and wait for a retry
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ processed: await runVideoJobs() });
}
