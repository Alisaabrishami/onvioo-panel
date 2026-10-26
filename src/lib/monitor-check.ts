import "server-only";
import { connect } from "node:tls";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatJalaliDateTime } from "./format";
import { type CheckResult, daysUntil, describeError, transition } from "./monitor";
import { notifyTeam } from "./notify";

const TIMEOUT_MS = 15_000;

export async function checkUrl(url: string, keyword: string | null): Promise<CheckResult> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "OnviooMonitor/1.0 (+uptime check)", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = keyword ? await res.text() : (await res.arrayBuffer(), "");
    const ms = Math.round(performance.now() - started);
    if (res.status >= 400) return { ok: false, status: res.status, ms, error: `خطای ${res.status}` };
    if (keyword && !body.includes(keyword)) return { ok: false, status: res.status, ms, error: `عبارت «${keyword}» در صفحه نبود` };
    return { ok: true, status: res.status, ms, error: null };
  } catch (error) {
    return { ok: false, status: null, ms: null, error: describeError(error) };
  }
}

// Expiry date of the certificate the site presents, or null when it can't be read
export function sslExpiry(url: string): Promise<Date | null> {
  const u = new URL(url);
  if (u.protocol !== "https:") return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = connect({ host: u.hostname, port: Number(u.port || 443), servername: u.hostname, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

type Monitor = typeof schema.monitors.$inferSelect;

async function runOne(m: Monitor, clientName: string) {
  const result = await checkUrl(m.url, m.keyword);
  const now = new Date();
  await db.insert(schema.monitorChecks).values({ monitorId: m.id, at: now, ...result });
  const recent = await db
    .select({ ok: schema.monitorChecks.ok })
    .from(schema.monitorChecks)
    .where(eq(schema.monitorChecks.monitorId, m.id))
    .orderBy(desc(schema.monitorChecks.at))
    .limit(2);
  const change = transition(m.up, recent);
  const patch: Partial<Monitor> = { lastCheckedAt: now, lastMs: result.ms };
  // Certificates change rarely; read once an hour
  if (!m.lastCheckedAt || now.getTime() - m.lastCheckedAt.getTime() > 3600_000 || !m.sslExpiresAt) {
    const exp = await sslExpiry(m.url);
    if (exp) patch.sslExpiresAt = exp;
  }
  const host = new URL(m.url).hostname;
  if (change === "down") {
    patch.up = false;
    patch.downSince = now;
    await notifyTeam({ title: `🔴 سایت ${host} از دسترس خارج شد`, body: `${clientName} · ${result.error ?? ""}`, href: "/monitoring" });
  } else if (change === "up") {
    const minutes = m.downSince ? Math.round((now.getTime() - m.downSince.getTime()) / 60000) : null;
    patch.up = true;
    patch.downSince = null;
    await notifyTeam({ title: `🟢 سایت ${host} دوباره در دسترس است`, body: `${clientName}${minutes != null ? ` · قطعی ${minutes} دقیقه از ${m.downSince ? formatJalaliDateTime(m.downSince) : ""}` : ""}`, href: "/monitoring" });
  } else if (m.up === null && result.ok) {
    patch.up = true;
  }
  const sslDays = daysUntil(patch.sslExpiresAt ?? m.sslExpiresAt, now);
  if (sslDays != null && sslDays <= 14 && (!m.sslWarnedAt || now.getTime() - m.sslWarnedAt.getTime() > 7 * 86400_000)) {
    patch.sslWarnedAt = now;
    await notifyTeam({ title: `گواهی SSL سایت ${host} ${sslDays <= 0 ? "منقضی شده" : `${sslDays} روز دیگر منقضی می‌شود`}`, body: clientName, href: "/monitoring" });
  }
  await db.update(schema.monitors).set(patch).where(eq(schema.monitors.id, m.id));
  return { id: m.id, ...result, change };
}

export async function runMonitors(ids?: string[]) {
  const rows = await db
    .select({ monitor: schema.monitors, clientName: schema.clients.name })
    .from(schema.monitors)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monitors.clientId))
    .where(and(eq(schema.monitors.active, true), ids ? inArray(schema.monitors.id, ids) : undefined));
  // A few at a time so one slow site does not hold up the rest
  const out = [];
  for (let i = 0; i < rows.length; i += 5) {
    out.push(...(await Promise.all(rows.slice(i, i + 5).map((r) => runOne(r.monitor, r.clientName)))));
  }
  return out;
}

export async function pruneChecks(days = 31) {
  await db.delete(schema.monitorChecks).where(lt(schema.monitorChecks.at, new Date(Date.now() - days * 86400_000)));
}

