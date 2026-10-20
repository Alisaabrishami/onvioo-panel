import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Any S3-compatible store works: ArvanCloud, ParsPack, MinIO, AWS
let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "default",
      forcePathStyle: true,
      // Checksums only where S3 demands them: many S3-compatible stores do not
      // understand the SDK's default aws-chunked uploads and save the framing
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
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

// For a <video> on the page: plays in the browser instead of downloading
export function presignView(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 * 60 });
}

// Size of an uploaded object, or null when nothing is stored under the key
export async function storedSize(key: string): Promise<number | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return res.ContentLength ?? null;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return null;
    throw error;
  }
}

// Background jobs read and write whole files on local disk
export async function downloadToFile(key: string, path: string): Promise<void> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty object ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(path));
}

export async function uploadFile(path: string, key: string, mime: string): Promise<number> {
  const { size } = await stat(path);
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime, ContentLength: size, Body: createReadStream(path) }),
  );
  return size;
}
