import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
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

// --- Phase 4: team and finance -----------------------------------------

export const leaveKindEnum = pgEnum("leave_kind", ["annual", "sick", "unpaid"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected"]);
export const payslipStatusEnum = pgEnum("payslip_status", ["draft", "paid"]);
export const accountKindEnum = pgEnum("account_kind", ["bank", "cash"]);
export const directionEnum = pgEnum("direction", ["in", "out"]);
export const financeCategoryEnum = pgEnum("finance_category", [
  "client_payment",
  "other_income",
  "salary",
  "rent",
  "bills",
  "software",
  "equipment",
  "ads",
  "transport",
  "other_expense",
  "partner_draw",
  "partner_contribution",
]);
export const importKindEnum = pgEnum("import_kind", ["bank_statement", "transactions"]);

export type LeaveKind = (typeof leaveKindEnum.enumValues)[number];
export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type FinanceCategory = (typeof financeCategoryEnum.enumValues)[number];
export type Direction = (typeof directionEnum.enumValues)[number];

// One stretch of work; switching client closes one stretch and opens the next
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    note: text("note"),
    // Set when an admin corrected the times
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("attendance_user_idx").on(t.userId, t.clockIn)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: leaveKindEnum("kind").notNull().default("annual"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason"),
    status: requestStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("leave_requests_user_idx").on(t.userId, t.startsOn)],
);

export const financeAccounts = pgTable("finance_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: accountKindEnum("kind").notNull().default("bank"),
  // Toman; the balance on the day the panel's records start
  openingBalance: bigint("opening_balance", { mode: "number" }).notNull().default(0),
  // Bank statement column mapping remembered from the last import
  importMapping: jsonb("import_mapping"),
  // Reconciled and locked: transactions on or before this day can't change
  lockedThrough: date("locked_through"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Share of profit in basis points (2500 = 25%)
  shareBp: integer("share_bp").notNull().default(0),
  openingBalance: bigint("opening_balance", { mode: "number" }).notNull().default(0),
  createdAt: createdAt(),
});

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: importKindEnum("kind").notNull(),
  accountId: uuid("account_id").references(() => financeAccounts.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  rows: integer("rows").notNull().default(0),
  // The uploaded sheet, kept until the person maps its columns and confirms
  pending: jsonb("pending").$type<string[][]>(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const recurringExpenses = pgTable("recurring_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: financeCategoryEnum("category").notNull().default("rent"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  accountId: uuid("account_id").references(() => financeAccounts.id, { onDelete: "set null" }),
  // Jalali day of month it falls due
  dueDay: integer("due_day").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Jalali month, e.g. "1405-07"
    period: text("period").notNull(),
    payType: payTypeEnum("pay_type").notNull(),
    rate: bigint("rate", { mode: "number" }).notNull(),
    workedMinutes: integer("worked_minutes").notNull().default(0),
    items: integer("items").notNull().default(0),
    base: bigint("base", { mode: "number" }).notNull().default(0),
    overtime: bigint("overtime", { mode: "number" }).notNull().default(0),
    bonus: bigint("bonus", { mode: "number" }).notNull().default(0),
    deductions: bigint("deductions", { mode: "number" }).notNull().default(0),
    net: bigint("net", { mode: "number" }).notNull().default(0),
    note: text("note"),
    status: payslipStatusEnum("status").notNull().default("draft"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payslips_user_period_idx").on(t.userId, t.period)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "restrict" }),
    day: date("day").notNull(),
    direction: directionEnum("direction").notNull(),
    // Toman, always positive; direction says which way it moved
    amount: bigint("amount", { mode: "number" }).notNull(),
    category: financeCategoryEnum("category").notNull(),
    description: text("description"),
    // Bank tracking number, used when matching statement lines
    reference: text("reference"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    payslipId: uuid("payslip_id").references(() => payslips.id, { onDelete: "set null" }),
    recurringId: uuid("recurring_id").references(() => recurringExpenses.id, { onDelete: "set null" }),
    receiptFileId: uuid("receipt_file_id").references(() => files.id, { onDelete: "set null" }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_account_day_idx").on(t.accountId, t.day),
    index("transactions_client_idx").on(t.clientId),
  ],
);

export const bankLines = pgTable(
  "bank_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    // Signed toman: deposits positive, withdrawals negative
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: text("description"),
    reference: text("reference"),
    balance: bigint("balance", { mode: "number" }),
    // Same line imported twice (overlapping statements) is skipped
    dedupeKey: text("dedupe_key").notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bank_lines_dedupe_idx").on(t.accountId, t.dedupeKey),
    index("bank_lines_account_day_idx").on(t.accountId, t.day),
  ],
);

// --- Phase 5: invoices, CRM, site monitoring ------------------------------

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed"]);
export const leadStageEnum = pgEnum("lead_stage", ["new", "contacted", "meeting", "proposal", "won", "lost"]);
export const leadSourceEnum = pgEnum("lead_source", ["instagram", "referral", "website", "ads", "other"]);
export const activityKindEnum = pgEnum("activity_kind", ["note", "call", "message", "meeting", "stage"]);

export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type LeadStage = (typeof leadStageEnum.enumValues)[number];
export type LeadSource = (typeof leadSourceEnum.enumValues)[number];
export type ActivityKind = (typeof activityKindEnum.enumValues)[number];
export type InvoiceItem = { title: string; qty: number; unitPrice: number };

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Shown on the invoice, e.g. ۱۰۲۴
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 1001 }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    items: jsonb("items").$type<InvoiceItem[]>().notNull(),
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    // Basis points of VAT, e.g. 1000 = 10%
    taxBp: integer("tax_bp").notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull(),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    note: text("note"),
    // Unguessable link the client can pay from without logging in
    payToken: text("pay_token").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_client_idx").on(t.clientId), uniqueIndex("invoices_token_idx").on(t.payToken)],
);

// One attempt to pay an invoice online
export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    gateway: text("gateway").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    authority: text("authority"),
    refId: text("ref_id"),
    cardPan: text("card_pan"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("invoice_payments_invoice_idx").on(t.invoiceId), uniqueIndex("invoice_payments_authority_idx").on(t.authority)],
);

// Panel-wide settings, one row per key
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    business: text("business"),
    phone: text("phone"),
    instagram: text("instagram"),
    source: leadSourceEnum("source").notNull().default("instagram"),
    stage: leadStageEnum("stage").notNull().default("new"),
    // Expected monthly deal size in toman
    value: bigint("value", { mode: "number" }),
    services: text("services"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    nextFollowUp: date("next_follow_up"),
    lostReason: text("lost_reason"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_stage_idx").on(t.stage), index("leads_follow_up_idx").on(t.nextFollowUp)],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull(),
    body: text("body").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt)],
);

// A client website the panel checks every few minutes
export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    // Text the page must contain, so a blank or hacked page counts as down
    keyword: text("keyword"),
    active: boolean("active").notNull().default(true),
    up: boolean("up"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastMs: integer("last_ms"),
    downSince: timestamp("down_since", { withTimezone: true }),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    domainExpiresOn: date("domain_expires_on"),
    sslWarnedAt: timestamp("ssl_warned_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("monitors_client_idx").on(t.clientId)],
);

export const monitorChecks = pgTable(
  "monitor_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    status: integer("status"),
    ms: integer("ms"),
    error: text("error"),
  },
  (t) => [index("monitor_checks_monitor_idx").on(t.monitorId, t.at)],
);

// ---------- Phase 6: video AI (subtitles, clips) ----------

export const videoJobKindEnum = pgEnum("video_job_kind", ["transcribe", "burn", "clip"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "done", "failed"]);

export type VideoJobKind = (typeof videoJobKindEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];

// One line of speech, times in seconds from the start of the video
export type Segment = { start: number; end: number; text: string };

// A highlight Claude picked from the transcript as a short vertical clip
export type ClipIdea = { start: number; end: number; title: string; hook: string; reason: string; score: number };

// Text spoken in a video file, edited by the team before it is burned in
export const transcripts = pgTable("transcripts", {
  fileId: uuid("file_id")
    .primaryKey()
    .references(() => files.id, { onDelete: "cascade" }),
  language: text("language").notNull().default("fa"),
  duration: real("duration"),
  segments: jsonb("segments").$type<Segment[]>().notNull(),
  clipIdeas: jsonb("clip_ideas").$type<ClipIdea[]>(),
  editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Slow video work (speech to text, burning subtitles, cutting clips) runs
// in the background, one job at a time, so a page never waits on ffmpeg
export const videoJobs = pgTable(
  "video_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: videoJobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    // The file or content the job produced
    outputFileId: uuid("output_file_id").references(() => files.id, { onDelete: "set null" }),
    outputContentId: uuid("output_content_id").references(() => contents.id, { onDelete: "set null" }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("video_jobs_status_idx").on(t.status, t.createdAt), index("video_jobs_file_idx").on(t.fileId)],
);
