import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { storageConfigured } from "@/lib/storage";
import { FileList } from "./file-list";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "فایل‌ها" };

export default async function FilesPage() {
  await requireTeam();
  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .orderBy(asc(schema.clients.name));

  return (
    <>
      <PageHeader title="فایل‌ها" description="فایل‌های خام و تدوین‌شده؛ مستقیم به فضای ابری آپلود می‌شوند" />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <h2 className="mb-3 font-semibold">آپلود</h2>
          {storageConfigured() ? (
            <Uploader clients={clients} />
          ) : (
            <p className="text-sm text-muted-foreground">
              برای آپلود، اطلاعات فضای ذخیره‌سازی ابری (S3) باید در تنظیمات سرور وارد شود.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">آخرین فایل‌ها</h2>
          <FileList />
        </Card>
      </div>
    </>
  );
}
