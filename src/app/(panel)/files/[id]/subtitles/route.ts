import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { toSrt, toVtt } from "@/lib/video";

// The edited transcript as a subtitle file, for editors who finish in Premiere or CapCut.
// The player on the studio page reads the .vtt form.
export async function GET(request: Request, ctx: RouteContext<"/files/[id]/subtitles">) {
  const user = await getCurrentUser();
  if (!user || user.role === "client") return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [row] = await db
    .select({ segments: schema.transcripts.segments, name: schema.files.name })
    .from(schema.transcripts)
    .innerJoin(schema.files, eq(schema.files.id, schema.transcripts.fileId))
    .where(eq(schema.transcripts.fileId, id));
  if (!row) return new Response(null, { status: 404 });

  const vtt = new URL(request.url).searchParams.get("format") === "vtt";
  const base = row.name.replace(/\.[^.]+$/, "");
  return new Response(vtt ? toVtt(row.segments) : toSrt(row.segments), {
    headers: {
      "content-type": vtt ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8",
      "cache-control": "no-store",
      ...(vtt ? {} : { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.srt`)}` }),
    },
  });
}
