import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { TYPE_LABELS } from "@/lib/content";
import { formatJalaliDate } from "@/lib/format";
import { CLIENT_STAGE_LABELS, StageProgress } from "./progress";

export const metadata: Metadata = { title: "محتوا" };

export default async function PortalContentPage() {
  const user = await requireClient();
  const rows = await db
    .select({
      id: schema.contents.id,
      title: schema.contents.title,
      type: schema.contents.type,
      stage: schema.contents.stage,
      publishAt: schema.contents.publishAt,
    })
    .from(schema.contents)
    .where(and(eq(schema.contents.clientId, user.clientId), ne(schema.contents.stage, "idea")))
    .orderBy(desc(schema.contents.updatedAt))
    .limit(200);

  const waiting = rows.filter((r) => r.stage === "client_review");
  const others = rows.filter((r) => r.stage !== "client_review");

  const card = (c: (typeof rows)[number]) => (
    <li key={c.id}>
      <Link href={`/portal/content/${c.id}`} className="block glass rounded-3xl p-4 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/50">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-medium">{c.title}</p>
          <Badge tone={c.stage === "client_review" ? "warning" : c.stage === "published" ? "success" : "neutral"}>
            {CLIENT_STAGE_LABELS[c.stage]}
          </Badge>
        </div>
        <StageProgress stage={c.stage} compact />
        <p className="mt-2 text-xs text-muted-foreground">
          {TYPE_LABELS[c.type]}
          {c.publishAt && ` · انتشار ${formatJalaliDate(c.publishAt)}`}
        </p>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title="محتوا" description="وضعیت تولید ریلز و استوری‌های شما" />
      {rows.length === 0 ? (
        <EmptyState>هنوز محتوایی برای شما در حال تولید نیست.</EmptyState>
      ) : (
        <div className="space-y-6">
          {waiting.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-warning">منتظر تأیید شما</h2>
              <ul className="space-y-2">{waiting.map(card)}</ul>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">همه محتواها</h2>
              <ul className="space-y-2">{others.map(card)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
