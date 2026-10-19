"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, invalid, optionalText, optionalUuid } from "@/lib/forms";
import { jalaliToIsoDate } from "@/lib/format";
import { notifyClient } from "@/lib/notify";
import { DEFAULT_MILESTONES, PROJECT_STATUS_LABELS } from "@/lib/services";

const optionalDate = z.string().transform((v, ctx) => {
  if (!v.trim()) return null;
  const iso = jalaliToIsoDate(v);
  if (!iso) {
    ctx.addIssue({ code: "custom", message: "تاریخ معتبر نیست" });
    return z.NEVER;
  }
  return iso;
});

const projectSchema = z.object({
  clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
  title: z.string().trim().min(2, { error: "عنوان پروژه را بنویسید" }),
  kind: z.enum(schema.serviceKindEnum.enumValues),
  status: z.enum(schema.projectStatusEnum.enumValues),
  url: optionalText.pipe(z.url({ protocol: /^https?$/, error: "آدرس سایت را کامل بنویسید (با https://)" }).nullable()),
  ownerId: optionalUuid,
  startsOn: optionalDate,
  dueOn: optionalDate,
  notes: optionalText,
});

function readProject(formData: FormData) {
  return projectSchema.safeParse({
    clientId: formData.get("clientId") ?? "",
    title: formData.get("title") ?? "",
    kind: formData.get("kind") ?? "website",
    status: formData.get("status") ?? "planning",
    url: formData.get("url") ?? "",
    ownerId: formData.get("ownerId") ?? "",
    startsOn: formData.get("startsOn") ?? "",
    dueOn: formData.get("dueOn") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function revalidateProjects(id?: string) {
  revalidatePath("/projects");
  revalidatePath("/portal/projects");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readProject(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const id = await db.transaction(async (tx) => {
    const [project] = await tx.insert(schema.projects).values(parsed.data).returning({ id: schema.projects.id });
    if (formData.get("withMilestones") === "on") {
      await tx
        .insert(schema.milestones)
        .values(DEFAULT_MILESTONES[parsed.data.kind].map((title, position) => ({ projectId: project.id, title, position })));
    }
    return project.id;
  });
  await audit(user.id, "create", "project", id, { title: parsed.data.title });
  revalidateProjects();
  redirect(`/projects/${id}`);
}

export async function updateProject(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readProject(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const [before] = await db.select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!before) return { message: "پروژه پیدا نشد" };
  await db.update(schema.projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  await audit(user.id, "update", "project", projectId);
  if (before.status !== parsed.data.status) {
    await notifyClient(parsed.data.clientId, {
      title: `پروژه «${parsed.data.title}»: ${PROJECT_STATUS_LABELS[parsed.data.status]}`,
      href: "/portal/projects",
    });
  }
  revalidateProjects(projectId);
  return { ok: true, message: "ذخیره شد" };
}

export async function addMilestone(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireTeam();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { errors: { title: ["عنوان مرحله را بنویسید"] } };
  const [row] = await db.select({ last: max(schema.milestones.position) }).from(schema.milestones).where(eq(schema.milestones.projectId, projectId));
  await db.insert(schema.milestones).values({ projectId, title, position: (row?.last ?? -1) + 1 });
  revalidateProjects(projectId);
  return { ok: true };
}

export async function toggleMilestone(milestoneId: string, done: boolean): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(milestoneId)) return;
  const [m] = await db
    .update(schema.milestones)
    .set({ done, doneAt: done ? new Date() : null })
    .where(eq(schema.milestones.id, milestoneId))
    .returning({ projectId: schema.milestones.projectId, title: schema.milestones.title });
  if (!m) return;
  if (done) {
    const [p] = await db.select({ clientId: schema.projects.clientId, title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, m.projectId));
    if (p) await notifyClient(p.clientId, { title: `مرحله «${m.title}» از پروژه «${p.title}» انجام شد`, href: "/portal/projects" });
  }
  await audit(user.id, done ? "complete" : "reopen", "milestone", milestoneId);
  revalidateProjects(m.projectId);
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  await requireTeam();
  if (!isUuid(milestoneId)) return;
  const [m] = await db.delete(schema.milestones).where(and(eq(schema.milestones.id, milestoneId))).returning({ projectId: schema.milestones.projectId });
  if (m) revalidateProjects(m.projectId);
}
