import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for third-party tokens stored in the database (Instagram).
// The key comes from TOKEN_SECRET, so a leaked database dump alone is useless.
function key(): Buffer | null {
  const secret = process.env.TOKEN_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

export function canEncrypt(): boolean {
  return key() !== null;
}

export function seal(plain: string): string {
  const k = key();
  if (!k) throw new Error("TOKEN_SECRET is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const k = key();
  if (!k) throw new Error("TOKEN_SECRET is not set");
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised sealed value");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
