import { and, desc, eq, notExists } from "drizzle-orm";
import { Download, FileVideo, File as FileIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { db, schema } from "@/db";
import { formatBytes, formatJalaliDateTime } from "@/lib/format";

export async function FileList({ clientId, limit = 100 }: { clientId?: string; limit?: number }) {
  const query = db
    .select({
      id: schema.files.id,
      name: schema.files.name,
      size: schema.files.size,
      mime: schema.files.mime,
      createdAt: schema.files.createdAt,
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      uploader: schema.users.name,
    })
    .from(schema.files)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.files.clientId))
    .leftJoin(schema.users, eq(schema.users.id, schema.files.uploadedBy))
    .orderBy(desc(schema.files.createdAt))
    .limit(limit);
  // Finance receipts stay in the finance pages, out of the team's file list
  const notReceipt = notExists(db.select().from(schema.transactions).where(eq(schema.transactions.receiptFileId, schema.files.id)));
  const rows = await query.where(clientId ? and(eq(schema.files.clientId, clientId), notReceipt) : notReceipt);

  if (rows.length === 0) return <EmptyState>هنوز فایلی آپلود نشده است.</EmptyState>;

  return (
    <ul className="divide-y divide-border">
      {rows.map((f) => {
        const Icon = f.mime.startsWith("video/") ? FileVideo : FileIcon;
        return (
          <li key={f.id} className="flex items-center gap-3 py-3">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(f.size)} · {formatJalaliDateTime(f.createdAt)}
                {f.uploader && ` · ${f.uploader}`}
                {!clientId && f.clientId && (
                  <>
                    {" · "}
                    <Link href={`/clients/${f.clientId}`} className="hover:text-primary">
                      {f.clientName}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <a
              href={`/files/${f.id}/download`}
              title="دانلود"
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-primary"
            >
              <Download className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
