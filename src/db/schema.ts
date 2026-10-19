import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "staff", "client"]);
export const clientStatusEnum = pgEnum("client_status", [
  "lead",
  "active",
  "paused",
  "ended",
]);
export const payTypeEnum = pgEnum("pay_type", ["hourly", "monthly", "per_item"]);

export const contentTypeEnum = pgEnum("content_type", ["reel", "story", "post", "carousel", "video"]);
// The production pipeline, in order
export const contentStageEnum = pgEnum("content_stage", [
  "idea",
  "shot",
  "editing",
  "internal_review",
  "client_review",
  "ready",
  "published",
]);
export const fileKindEnum = pgEnum("file_kind", ["raw", "edit", "cover", "other"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "doing", "done"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);

export type Role = (typeof roleEnum.enumValues)[number];
export type ContentType = (typeof contentTypeEnum.enumValues)[number];
export type ContentStage = (typeof contentStageEnum.enumValues)[number];
export type FileKind = (typeof fileKindEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number];
export type PayType = (typeof payTypeEnum.enumValues)[number];

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brand: text("brand"),
  instagram: text("instagram"),
  phone: text("phone"),
  status: clientStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Normalized Iranian mobile number: 09xxxxxxxxx
    phone: text("phone").notNull(),
    passwordHash: text("password_hash"),
    role: roleEnum("role").notNull(),
    // Set only for role = client: which client account this login belongs to
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

export const staffProfiles = pgTable("staff_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  payType: payTypeEnum("pay_type").notNull().default("monthly"),
  // Amount in toman; meaning depends on payType (per hour, per month, per item)
  rate: bigint("rate", { mode: "number" }).notNull().default(0),
  startDate: date("start_date"),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("otp_phone_idx").on(t.phone)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "set null" }),
    kind: fileKindEnum("kind").notNull().default("other"),
    // Edit number within a content item: 1 for the first cut, 2 after changes…
    version: integer("version"),
    createdAt: createdAt(),
  },
  (t) => [index("files_client_idx").on(t.clientId), index("files_content_idx").on(t.contentId)],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  data: jsonb("data"),
  createdAt: createdAt(),
});

export const shoots = pgTable(
  "shoots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    location: text("location"),
    crewId: uuid("crew_id").references(() => users.id, { onDelete: "set null" }),
    script: text("script"),
    // One item per line; a leading "x " marks it packed
    checklist: text("checklist"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("shoots_starts_idx").on(t.startsAt)],
);

export const contents = pgTable(
  "contents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: contentTypeEnum("type").notNull().default("reel"),
    stage: contentStageEnum("stage").notNull().default("idea"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    shootId: uuid("shoot_id").references(() => shoots.id, { onDelete: "set null" }),
    // Deadline for the current stage of work
    dueAt: timestamp("due_at", { withTimezone: true }),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    caption: text("caption"),
    hashtags: text("hashtags"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contents_client_idx").on(t.clientId),
    index("contents_stage_idx").on(t.stage),
    index("contents_publish_idx").on(t.publishAt),
  ],
);

export const contentComments = pgTable(
  "content_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // Second of the video the comment points at, when it is about a moment
    timecode: integer("timecode"),
    createdAt: createdAt(),
  },
  (t) => [index("comments_content_idx").on(t.contentId)],
);

export const contentEvents = pgTable(
  "content_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fromStage: contentStageEnum("from_stage"),
    toStage: contentStageEnum("to_stage").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_content_idx").on(t.contentId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // Set for tasks the pipeline creates, e.g. "edit" when content is shot
    autoKey: text("auto_key"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId, t.status),
    index("tasks_content_idx").on(t.contentId),
  ],
);
