"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { jalaliToIsoDate, toPersianDigits } from "@/lib/format";
import { type FormState, optionalText, optionalUuid, typedValues } from "@/lib/forms";
import { normalizeUrl } from "@/lib/monitor";
import { runMonitors } from "@/lib/monitor-check";

const monitorSchema = z.object({
  clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
  projectId: optionalUuid,
  url: z.string().transform((v, ctx) => {
    const u = normalizeUrl(v);
    if (!u) {
      ctx.addIssue({ code: "custom", message: "آدرس سایت را درست بنویسید، مثل cafe-sample.ir" });
      return z.NEVER;
    }
    return u;
  }),
  keyword: optionalText,
  domainExpiresOn: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const d = jalaliToIsoDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "تاریخ نامعتبر" });
      return z.NEVER;
    }
    return d;
  }),
});

export async function createMonitor(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const v = typedValues(formData);
  const parsed = monitorSchema.safeParse({
    clientId: v.clientId ?? "",
    projectId: v.projectId ?? "",
    url: v.url ?? "",
    keyword: v.keyword ?? "",
    domainExpiresOn: v.domainExpiresOn ?? "",
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values: v };
  const [m] = await db.insert(schema.monitors).values(parsed.data).returning({ id: schema.monitors.id });
  await audit(admin.id, "create", "monitor", m.id, { url: parsed.data.url });
  // First check right away so the card is not empty
  await runMonitors([m.id]);
  revalidatePath("/monitoring");
  return { ok: true, message: "اضافه شد و اولین بررسی انجام شد" };
}

export async function checkNow(id?: string): Promise<FormState> {
  await requireTeam();
  if (id && !isUuid(id)) return { message: "پیدا نشد" };
  const results = await runMonitors(id ? [id] : undefined);
  revalidatePath("/monitoring");
  const down = results.filter((r) => !r.ok).length;
  return { ok: down === 0, message: down ? `${toPersianDigits(down)} سایت پاسخ درست نداد` : `${toPersianDigits(results.length)} سایت بررسی شد؛ همه سالم` };
}

export async function toggleMonitor(id: string, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.update(schema.monitors).set({ active, ...(active ? {} : { up: null, downSince: null }) }).where(eq(schema.monitors.id, id));
  await audit(admin.id, active ? "activate" : "pause", "monitor", id);
  revalidatePath("/monitoring");
}

export async function deleteMonitor(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.delete(schema.monitors).where(eq(schema.monitors.id, id));
  await audit(admin.id, "delete", "monitor", id);
  revalidatePath("/monitoring");
}
