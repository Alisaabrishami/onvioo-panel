import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { presignDownload } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/files/[id]/download">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id));

  // Clients may only download files that belong to their own account
  const allowed =
    file && (user.role !== "client" || (file.clientId !== null && file.clientId === user.clientId));
  if (!allowed) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(await presignDownload(file.key, file.name));
}
