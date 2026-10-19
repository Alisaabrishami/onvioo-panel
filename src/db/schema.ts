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
    // Team-only notes the client never sees in the portal
    internal: boolean("internal").notNull().default(false),
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

export const contractStatusEnum = pgEnum("contract_status", ["draft", "sent", "signed", "cancelled"]);
export const serviceKindEnum = pgEnum("service_kind", ["website", "frontend", "backend", "seo", "support"]);
export const projectStatusEnum = pgEnum("project_status", ["planning", "in_progress", "review", "done", "paused"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "answered", "closed"]);

export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];
export type ServiceKind = (typeof serviceKindEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Total in toman; null when the contract has no fixed price
    amount: bigint("amount", { mode: "number" }),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    status: contractStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Evidence of the signature: who confirmed with which SMS code, from where,
    // and a SHA-256 of exactly the text they saw
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: uuid("signed_by").references(() => users.id, { onDelete: "set null" }),
    signerName: text("signer_name"),
    signerPhone: text("signer_phone"),
    signerIp: text("signer_ip"),
    signerAgent: text("signer_agent"),
    bodyHash: text("body_hash"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("contracts_client_idx").on(t.clientId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: serviceKindEnum("kind").notNull().default("website"),
    status: projectStatusEnum("status").notNull().default("planning"),
    url: text("url"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    startsOn: date("starts_on"),
    dueOn: date("due_on"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_client_idx").on(t.clientId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Human-friendly number shown to clients, e.g. #1024
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 1001 }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tickets_client_idx").on(t.clientId), index("tickets_status_idx").on(t.status)],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const igAccountKindEnum = pgEnum("ig_account_kind", ["own", "competitor"]);
export const insightKindEnum = pgEnum("insight_kind", ["viral_score", "weekly_report", "trend_ideas", "competitor_spike"]);

export type IgAccountKind = (typeof igAccountKindEnum.enumValues)[number];
export type InsightKind = (typeof insightKindEnum.enumValues)[number];

// A client's own Instagram page, or a competitor page the team watches for them
export const igAccounts = pgTable(
  "ig_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: igAccountKindEnum("kind").notNull().default("own"),
    username: text("username").notNull(),
    // Graph API connection, own pages only; the token is encrypted at rest
    igUserId: text("ig_user_id"),
    accessToken: text("access_token"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ig_accounts_client_username_idx").on(t.clientId, t.username)],
);

export const igDailyStats = pgTable(
  "ig_daily_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => igAccounts.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    followers: integer("followers"),
    reach: integer("reach"),
    views: integer("views"),
  },
  (t) => [uniqueIndex("ig_daily_stats_account_day_idx").on(t.accountId, t.day)],
);

export const igPosts = pgTable(
  "ig_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => igAccounts.id, { onDelete: "cascade" }),
    // Instagram's media id, or the permalink for imported rows
    externalId: text("external_id").notNull(),
    permalink: text("permalink"),
    type: contentTypeEnum("type").notNull().default("post"),
    caption: text("caption"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "set null" }),
    views: integer("views"),
    reach: integer("reach"),
    likes: integer("likes"),
    comments: integer("comments"),
    saves: integer("saves"),
    shares: integer("shares"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ig_posts_account_external_idx").on(t.accountId, t.externalId),
    index("ig_posts_posted_idx").on(t.accountId, t.postedAt),
  ],
);

// AI results and alerts: viral scores, weekly reports, trend ideas, competitor spikes
export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: insightKindEnum("kind").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => igPosts.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    // Weekly reports become visible in the portal once the team shares them
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("insights_client_idx").on(t.clientId, t.kind), index("insights_content_idx").on(t.contentId)],
);
