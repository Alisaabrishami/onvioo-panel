import "server-only";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Any S3-compatible store works: ArvanCloud, ParsPack, MinIO, AWS
let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "default",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return client;
}

function bucket(): string {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set");
  return name;
}

export function storageConfigured(): boolean {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY);
}

export function buildObjectKey(fileName: string, clientId?: string | null): string {
  const safe = fileName.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-120);
  const month = new Date().toISOString().slice(0, 7);
  return `${clientId ?? "general"}/${month}/${randomUUID()}-${safe}`;
}

// The browser uploads straight to storage, so large videos never pass
// through the app server
export function presignUpload(key: string, mime: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }),
    { expiresIn: 60 * 60 },
  );
}

export function presignDownload(key: string, fileName: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: 10 * 60 },
  );
}
