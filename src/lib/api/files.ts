import "server-only";
import type { schema } from "@/db";
import { presignDownload, presignView, storageConfigured } from "@/lib/storage";

type FileRow = typeof schema.files.$inferSelect;

// A file with short-lived links: viewUrl plays or shows it, downloadUrl saves it
export async function fileView(file: FileRow, withLinks = true) {
  const { key, ...rest } = file;
  const links = withLinks && storageConfigured();
  return {
    ...rest,
    viewUrl: links ? await presignView(key) : null,
    downloadUrl: links ? await presignDownload(key, file.name) : null,
  };
}
