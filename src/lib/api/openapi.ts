// OpenAPI 3.1 description of /api/v1, served at /api/v1/openapi.json for
// whoever builds the mobile app (import it into Postman, Swagger UI or a code generator)

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object, description = "OK") => ({
  description,
  content: { "application/json": { schema: { type: "object", properties: { data: schema }, required: ["data"] } } },
});
const json = (schema: object) => ({ required: true, content: { "application/json": { schema } } });
const list = (item: object) => ({ type: "object", properties: { items: { type: "array", items: item } } });
const idPath = [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }];
const paging = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
];
const errors = {
  "401": { description: "Missing, expired or revoked token", content: { "application/json": { schema: ref("Error") } } },
  "403": { description: "Not allowed for this role", content: { "application/json": { schema: ref("Error") } } },
  "422": { description: "Invalid input; message says what to fix", content: { "application/json": { schema: ref("Error") } } },
};
const team = { tags: ["Team"], ...{ "x-roles": ["admin", "staff"] } };
const client = { tags: ["Client"], ...{ "x-roles": ["client"] } };

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Onvioo Panel API",
    version: "1.0.0",
    description:
      "JSON API for the Onvioo mobile app. Sign in with a phone number (SMS code or password) to get a bearer token valid for 90 days, then send it as `Authorization: Bearer <token>`. Every success is `{ data }`; every error is `{ error: { code, message } }` where `message` is Persian text ready to show. Times are ISO 8601 (UTC); amounts are toman. `href` values in notifications are panel paths the app can map to screens.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { code: { type: "string", examples: ["unauthorized", "not_found", "invalid"] }, message: { type: "string" } } } },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          phone: { type: "string", examples: ["09120000000"] },
          role: { enum: ["admin", "staff", "client"] },
          clientId: { type: ["string", "null"], format: "uuid" },
          clientName: { type: ["string", "null"] },
        },
      },
      Session: { type: "object", properties: { token: { type: "string" }, expiresAt: { type: "string", format: "date-time" }, user: ref("User") } },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          status: { enum: ["todo", "doing", "done"] },
          statusLabel: { type: "string" },
          priority: { enum: ["low", "normal", "high", "urgent"] },
          priorityLabel: { type: "string" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          clientId: { type: ["string", "null"] },
          clientName: { type: ["string", "null"] },
          contentId: { type: ["string", "null"] },
          assigneeId: { type: ["string", "null"] },
          assigneeName: { type: ["string", "null"] },
        },
      },
      Stage: { enum: ["idea", "shot", "editing", "internal_review", "client_review", "ready", "published"] },
      Content: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          type: { enum: ["reel", "story", "post", "carousel", "video"] },
          typeLabel: { type: "string" },
          stage: ref("Stage"),
          stageLabel: { type: "string" },
          clientId: { type: "string" },
          clientName: { type: "string" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          publishAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      ContentDetail: {
        allOf: [
          ref("Content"),
          {
            type: "object",
            properties: {
              caption: { type: ["string", "null"] },
              hashtags: { type: ["string", "null"] },
              files: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    mime: { type: "string" },
                    kind: { enum: ["raw", "edit", "cover", "other"] },
                    version: { type: ["integer", "null"] },
                    viewUrl: { type: ["string", "null"], description: "Short-lived link for an in-app player" },
                    downloadUrl: { type: ["string", "null"] },
                  },
                },
              },
              comments: { type: "array", items: ref("Comment") },
            },
          },
        ],
      },
      Comment: {
        type: "object",
        properties: {
          id: { type: "string" },
          body: { type: "string" },
          timecode: { type: ["integer", "null"], description: "Second of the video the comment is about" },
          internal: { type: "boolean" },
          author: { type: ["string", "null"] },
          authorRole: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Attendance: {
        type: "object",
        properties: {
          clockedIn: { type: "boolean" },
          since: { type: ["string", "null"], format: "date-time" },
          clientId: { type: ["string", "null"] },
          clientName: { type: ["string", "null"] },
          todayMinutes: { type: "integer" },
        },
      },
      Notification: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, body: { type: ["string", "null"] }, href: { type: ["string", "null"] }, readAt: { type: ["string", "null"] }, createdAt: { type: "string" } },
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string" },
          number: { type: "integer" },
          label: { type: "string" },
          title: { type: "string" },
          total: { type: "integer", description: "Toman" },
          status: { enum: ["draft", "sent", "paid", "cancelled"] },
          issuedOn: { type: "string", format: "date" },
          dueOn: { type: ["string", "null"], format: "date" },
          payUrl: { type: ["string", "null"], description: "Online payment page, for sent invoices" },
        },
      },
      ReportSummary: {
        type: "object",
        properties: { id: { type: "string" }, clientId: { type: "string" }, clientName: { type: "string" }, period: { type: "string", examples: ["1405-07"] }, periodLabel: { type: "string" }, headline: { type: "string" }, sharedAt: { type: ["string", "null"] } },
      },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/auth/otp": {
      post: {
        tags: ["Auth"],
        summary: "Send a login code by SMS",
        security: [],
        requestBody: json({ type: "object", required: ["phone"], properties: { phone: { type: "string" } } }),
        responses: { "200": ok({ type: "object", properties: { sent: { const: true }, expiresIn: { type: "integer" } } }), "429": { description: "too_soon or too_many" } },
      },
    },
    "/auth/verify": {
      post: {
        tags: ["Auth"],
        summary: "Trade the SMS code for a token",
        security: [],
        requestBody: json({ type: "object", required: ["phone", "code"], properties: { phone: { type: "string" }, code: { type: "string", pattern: "^\\d{6}$" }, device: { type: "string", description: "Shown in audit logs, e.g. iPhone 15" } } }),
        responses: { "200": ok(ref("Session")), "401": { description: "bad_code" } },
      },
    },
    "/auth/password": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with phone and password",
        security: [],
        requestBody: json({ type: "object", required: ["phone", "password"], properties: { phone: { type: "string" }, password: { type: "string" }, device: { type: "string" } } }),
        responses: { "200": ok(ref("Session")), "401": { description: "bad_password" } },
      },
    },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Revoke this token", responses: { "200": ok({ type: "object" }), ...errors } } },
    "/me": { get: { tags: ["Auth"], summary: "Who is signed in, plus unread notification count", responses: { "200": ok({ allOf: [ref("User"), { type: "object", properties: { unread: { type: "integer" } } }] }), ...errors } } },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        parameters: [{ name: "unread", in: "query", schema: { const: "1" } }, ...paging],
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("Notification") }, unread: { type: "integer" } } }), ...errors },
      },
    },
    "/notifications/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark read; omit ids to mark all",
        requestBody: json({ type: "object", properties: { ids: { type: "array", items: { type: "string", format: "uuid" } } } }),
        responses: { "200": ok({ type: "object", properties: { marked: { type: "integer" } } }), ...errors },
      },
    },
    "/today": {
      get: {
        ...team,
        summary: "Home screen: today's shoots, due tasks and content, and the clock",
        responses: { "200": ok({ type: "object", properties: { shoots: { type: "array" }, tasks: { type: "array" }, contents: { type: "array" }, attendance: ref("Attendance") } }), ...errors },
      },
    },
    "/tasks": {
      get: {
        ...team,
        parameters: [{ name: "scope", in: "query", schema: { enum: ["mine", "all"], default: "mine" } }, { name: "status", in: "query", schema: { enum: ["open", "done", "all"], default: "open" } }, ...paging],
        responses: { "200": ok(list(ref("Task"))), ...errors },
      },
      post: {
        ...team,
        summary: "Create a task (assigned to me unless assigneeId is given)",
        requestBody: json({
          type: "object",
          required: ["title"],
          properties: { title: { type: "string" }, description: { type: "string" }, priority: { enum: ["low", "normal", "high", "urgent"] }, assigneeId: { type: "string" }, clientId: { type: "string" }, dueAt: { type: "string", format: "date-time" } },
        }),
        responses: { "201": ok(ref("Task"), "Created"), ...errors },
      },
    },
    "/tasks/{id}": {
      patch: {
        ...team,
        parameters: idPath,
        requestBody: json({ type: "object", required: ["status"], properties: { status: { enum: ["todo", "doing", "done"] } } }),
        responses: { "200": ok(ref("Task")), ...errors },
      },
    },
    "/contents": {
      get: {
        tags: ["Team", "Client"],
        summary: "Team: all items. Client: own started items; use stage=client_review for the approval queue",
        parameters: [{ name: "stage", in: "query", schema: ref("Stage") }, { name: "clientId", in: "query", schema: { type: "string" } }, { name: "mine", in: "query", schema: { const: "1" } }, ...paging],
        responses: { "200": ok(list(ref("Content"))), ...errors },
      },
    },
    "/contents/{id}": { get: { tags: ["Team", "Client"], parameters: idPath, responses: { "200": ok(ref("ContentDetail")), ...errors } } },
    "/contents/{id}/stage": {
      post: { ...team, summary: "Move along the pipeline (creates auto tasks and client notices like the board)", parameters: idPath, requestBody: json({ type: "object", required: ["stage"], properties: { stage: ref("Stage") } }), responses: { "200": ok({ type: "object" }), ...errors } },
    },
    "/contents/{id}/comments": {
      post: {
        tags: ["Team", "Client"],
        parameters: idPath,
        requestBody: json({ type: "object", required: ["body"], properties: { body: { type: "string" }, timecode: { type: "integer" }, internal: { type: "boolean", description: "Team only; hidden from the client" } } }),
        responses: { "201": ok(ref("Comment"), "Created"), ...errors },
      },
    },
    "/contents/{id}/approve": { post: { ...client, parameters: idPath, responses: { "200": ok({ type: "object" }), "409": { description: "not_waiting" }, ...errors } } },
    "/contents/{id}/changes": {
      post: {
        ...client,
        summary: "Request changes; the item goes back to editing",
        parameters: idPath,
        requestBody: json({ type: "object", required: ["body"], properties: { body: { type: "string" }, timecode: { type: "integer" } } }),
        responses: { "200": ok({ type: "object" }), "409": { description: "not_waiting" }, ...errors },
      },
    },
    "/attendance": { get: { ...team, responses: { "200": ok(ref("Attendance")), ...errors } } },
    "/attendance/clock-in": {
      post: { ...team, summary: "Clock in, or switch client while clocked in", requestBody: json({ type: "object", properties: { clientId: { type: ["string", "null"] } } }), responses: { "200": ok({ type: "object", properties: { at: { type: "string" }, switched: { type: "boolean" }, clientName: { type: ["string", "null"] } } }), ...errors } },
    },
    "/attendance/clock-out": { post: { ...team, responses: { "200": ok({ type: "object", properties: { at: { type: "string" }, todayMinutes: { type: "integer" } } }), "409": { description: "not_clocked_in" }, ...errors } } },
    "/clients": { get: { ...team, parameters: [{ name: "status", in: "query", schema: { enum: ["active", "all"] } }], responses: { "200": ok(list({ type: "object" })), ...errors } } },
    "/shoots": {
      get: {
        ...team,
        parameters: [{ name: "from", in: "query", schema: { type: "string", format: "date-time" } }, { name: "to", in: "query", schema: { type: "string", format: "date-time" } }, { name: "mine", in: "query", schema: { const: "1" } }],
        responses: { "200": ok(list({ type: "object" })), ...errors },
      },
    },
    "/invoices": {
      get: { tags: ["Client"], summary: "Client: own sent and paid invoices. Admin: all (clientId, status filters). Staff: 403", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { name: "clientId", in: "query", schema: { type: "string" } }, ...paging], responses: { "200": ok(list(ref("Invoice"))), ...errors } },
    },
    "/reports": {
      get: { tags: ["Client", "Team"], summary: "Monthly reports. Client: those sent to them", parameters: [{ name: "clientId", in: "query", schema: { type: "string" } }, { name: "period", in: "query", schema: { type: "string" } }, ...paging], responses: { "200": ok(list(ref("ReportSummary"))), ...errors } },
    },
    "/reports/{id}": {
      get: { tags: ["Client", "Team"], summary: "Full report; pdfUrl opens the printable page", parameters: idPath, responses: { "200": ok({ type: "object" }), ...errors } },
    },
  },
} as const;
