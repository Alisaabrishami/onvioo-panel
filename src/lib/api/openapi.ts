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
const roles = (tag: string, r: string[]) => ({ tags: [tag], "x-roles": r });
const conflict = { "409": { description: "The item is not in a state that allows this; message says why", content: { "application/json": { schema: ref("Error") } } } };
const notFound = { "404": { description: "Not found, or not visible to this account", content: { "application/json": { schema: ref("Error") } } } };
const uuidField = { type: "string", format: "uuid" };
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Onvioo Panel API",
    version: "1.1.0",
    description:
      "JSON API for the Onvioo mobile app. Sign in with a phone number (SMS code or password) to get a bearer token valid for 90 days, then send it as `Authorization: Bearer <token>`. Every success is `{ data }`; every error is `{ error: { code, message } }` where `message` is Persian text ready to show. Times are ISO 8601 (UTC); amounts are toman. `href` values in notifications are panel paths the app can map to screens.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", examples: ["unauthorized", "not_found", "invalid", "conflict", "forbidden"] },
              message: { type: "string" },
              field: { type: "string", description: "The input field the message is about, when there is one" },
            },
          },
        },
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
      Attachment: { type: "object", properties: { id: uuidField, name: { type: "string" }, size: { type: "integer" }, mime: { type: "string" } } },
      File: {
        type: "object",
        properties: {
          id: uuidField,
          name: { type: "string" },
          size: { type: "integer" },
          mime: { type: "string" },
          kind: { enum: ["raw", "edit", "cover", "other"] },
          clientId: nullable("string"),
          contentId: nullable("string"),
          ticketMessageId: nullable("string"),
          version: nullable("integer"),
          viewUrl: { type: ["string", "null"], description: "Only on GET /files/{id}; valid 1 hour" },
          downloadUrl: { type: ["string", "null"], description: "Only on GET /files/{id}; valid 10 minutes" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      UploadIntent: {
        type: "object",
        properties: {
          key: { type: "string", description: "Send back to /uploads/complete" },
          uploadUrl: { type: "string", description: "PUT the raw bytes here" },
          method: { const: "PUT" },
          headers: { type: "object", description: "Headers to send with the PUT (Content-Type)" },
          expiresIn: { type: "integer", description: "Seconds the URL stays valid" },
        },
      },
      Ticket: {
        type: "object",
        properties: {
          id: uuidField,
          number: { type: "integer", examples: [1024] },
          title: { type: "string" },
          status: { enum: ["open", "answered", "closed"] },
          statusLabel: { type: "string" },
          priority: { enum: ["normal", "high", "urgent"] },
          clientId: uuidField,
          clientName: { type: "string" },
          projectId: nullable("string"),
          projectTitle: nullable("string"),
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      TicketMessage: {
        type: "object",
        properties: {
          id: uuidField,
          body: { type: "string" },
          author: nullable("string"),
          authorRole: nullable("string"),
          mine: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          attachments: { type: "array", items: ref("Attachment"), description: "Open with GET /files/{id}" },
        },
      },
      TicketDetail: { allOf: [ref("Ticket"), { type: "object", properties: { messages: { type: "array", items: ref("TicketMessage") } } }] },
      Contract: {
        type: "object",
        properties: {
          id: uuidField,
          clientId: uuidField,
          title: { type: "string" },
          body: { type: "string" },
          amount: nullable("integer", { description: "Toman" }),
          startsOn: nullable("string", { format: "date" }),
          endsOn: nullable("string", { format: "date" }),
          status: { enum: ["draft", "sent", "signed", "cancelled"] },
          statusLabel: { type: "string" },
          sentAt: nullable("string"),
          signedAt: nullable("string"),
          signerName: nullable("string"),
          signerPhone: nullable("string"),
          signerIp: nullable("string"),
          bodyHash: nullable("string", { description: "SHA-256 of the signed terms" }),
          intact: { type: ["boolean", "null"], description: "For signed contracts: the text still matches bodyHash" },
          pdfUrl: { type: "string", description: "Printable page in the panel or portal" },
        },
      },
      ContractInput: {
        type: "object",
        required: ["clientId", "title", "body"],
        properties: { clientId: uuidField, title: { type: "string" }, body: { type: "string" }, amount: nullable("integer"), startsOn: nullable("string", { format: "date" }), endsOn: nullable("string", { format: "date" }) },
      },
      Lead: {
        type: "object",
        properties: {
          id: uuidField,
          name: { type: "string" },
          business: nullable("string"),
          phone: nullable("string"),
          instagram: nullable("string"),
          source: { enum: ["instagram", "referral", "website", "ads", "other"] },
          sourceLabel: { type: "string" },
          stage: { enum: ["new", "contacted", "meeting", "proposal", "won", "lost"] },
          stageLabel: { type: "string" },
          value: nullable("integer", { description: "Expected monthly deal, toman" }),
          services: nullable("string"),
          ownerId: nullable("string"),
          ownerName: nullable("string"),
          nextFollowUp: nullable("string", { format: "date" }),
          followUp: { enum: ["overdue", "today", "soon", null] },
          lostReason: nullable("string"),
          clientId: nullable("string", { description: "Set once converted to a client" }),
          notes: nullable("string"),
        },
      },
      LeadInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          business: nullable("string"),
          phone: nullable("string"),
          instagram: nullable("string"),
          source: { enum: ["instagram", "referral", "website", "ads", "other"] },
          value: nullable("integer"),
          services: nullable("string"),
          ownerId: nullable("string"),
          nextFollowUp: nullable("string", { format: "date" }),
          notes: nullable("string"),
        },
      },
      LeadActivity: {
        type: "object",
        properties: { id: uuidField, kind: { enum: ["note", "call", "message", "meeting", "stage"] }, kindLabel: { type: "string" }, body: { type: "string" }, author: nullable("string"), createdAt: { type: "string", format: "date-time" } },
      },
      Payslip: {
        type: "object",
        properties: {
          id: uuidField,
          userId: uuidField,
          name: nullable("string"),
          period: { type: "string", examples: ["1405-07"] },
          periodLabel: { type: "string" },
          payType: { enum: ["hourly", "monthly", "per_item"] },
          payTypeLabel: { type: "string" },
          rate: { type: "integer" },
          workedMinutes: { type: "integer" },
          items: { type: "integer" },
          base: { type: "integer" },
          overtime: { type: "integer" },
          bonus: { type: "integer" },
          deductions: { type: "integer" },
          net: { type: "integer" },
          note: nullable("string"),
          status: { enum: ["draft", "paid"] },
          statusLabel: { type: "string" },
          paidAt: nullable("string"),
          pdfUrl: { type: "string" },
        },
      },
      Device: {
        type: "object",
        properties: {
          id: { type: "string", description: "Pass to DELETE /me/sessions/{id}" },
          kind: { enum: ["browser", "app"] },
          device: { type: "string" },
          detail: nullable("string", { examples: ["Chrome روی Windows"] }),
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          current: { type: "boolean" },
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
    "/team": { get: { ...team, summary: "Active team members, for assignee and owner pickers", responses: { "200": ok(list({ type: "object", properties: { id: uuidField, name: { type: "string" }, role: { type: "string" }, title: nullable("string") } })), ...errors } } },
    "/me/sessions": {
      get: { tags: ["Account"], summary: "Browsers and apps signed in to this account", responses: { "200": ok(list(ref("Device"))), ...errors } },
      delete: { tags: ["Account"], summary: "Sign out every other browser and app", responses: { "200": ok({ type: "object", properties: { revoked: { type: "integer" } } }), ...errors } },
    },
    "/me/sessions/{id}": { delete: { tags: ["Account"], summary: "Sign out one browser or app", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }), ...notFound, ...errors } } },
    "/uploads": {
      post: {
        tags: ["Files"],
        summary: "Step 1: get a presigned URL, then PUT the bytes to it",
        description: "Team members may file into any client or content item (5 GB max). Clients upload attachments into their own account (500 MB max).",
        requestBody: json({
          type: "object",
          required: ["name", "size"],
          properties: { name: { type: "string" }, size: { type: "integer" }, mime: { type: "string" }, clientId: nullable("string"), contentId: nullable("string"), kind: { enum: ["raw", "edit", "cover", "other"] } },
        }),
        responses: { "201": ok(ref("UploadIntent"), "Created"), "503": { description: "storage_unavailable" }, ...errors },
      },
    },
    "/uploads/complete": {
      post: {
        tags: ["Files"],
        summary: "Step 2: register the uploaded file (same fields plus key)",
        requestBody: json({ type: "object", required: ["name", "size", "key"], properties: { name: { type: "string" }, size: { type: "integer" }, mime: { type: "string" }, clientId: nullable("string"), contentId: nullable("string"), kind: { type: "string" }, key: { type: "string" } } }),
        responses: { "201": ok(ref("File"), "Created"), "409": { description: "not_uploaded (PUT not finished) or already registered" }, ...errors },
      },
    },
    "/files": {
      get: {
        tags: ["Files"],
        summary: "Team: all files. Client: their account's files without raw footage",
        parameters: [{ name: "clientId", in: "query", schema: uuidField }, { name: "contentId", in: "query", schema: uuidField }, { name: "kind", in: "query", schema: { enum: ["raw", "edit", "cover", "other"] } }, ...paging],
        responses: { "200": ok(list(ref("File"))), ...errors },
      },
    },
    "/files/{id}": { get: { tags: ["Files"], summary: "One file with view and download links", parameters: idPath, responses: { "200": ok(ref("File")), ...notFound, ...errors } } },
    "/tickets": {
      get: {
        tags: ["Tickets"],
        summary: "Team: all tickets. Client: their own",
        parameters: [{ name: "status", in: "query", schema: { enum: ["open", "answered", "closed", "active"] } }, { name: "clientId", in: "query", schema: uuidField }, ...paging],
        responses: { "200": ok(list(ref("Ticket"))), ...errors },
      },
      post: {
        ...roles("Tickets", ["client"]),
        summary: "Open a ticket; the team is notified",
        requestBody: json({
          type: "object",
          required: ["title", "body"],
          properties: { title: { type: "string" }, body: { type: "string" }, projectId: nullable("string"), priority: { enum: ["normal", "high", "urgent"] }, fileIds: { type: "array", items: uuidField, maxItems: 10 } },
        }),
        responses: { "201": ok(ref("Ticket"), "Created"), ...errors },
      },
    },
    "/tickets/{id}": {
      get: { tags: ["Tickets"], summary: "The ticket and its conversation", parameters: idPath, responses: { "200": ok(ref("TicketDetail")), ...notFound, ...errors } },
      patch: { tags: ["Tickets"], summary: "Team opens or closes; a client can only close", parameters: idPath, requestBody: json({ type: "object", required: ["status"], properties: { status: { enum: ["open", "closed"] } } }), responses: { "200": ok(ref("Ticket")), ...notFound, ...errors } },
    },
    "/tickets/{id}/messages": {
      post: {
        tags: ["Tickets"],
        summary: "Reply (team: marks answered and texts the client; client: reopens for the team)",
        parameters: idPath,
        requestBody: json({ type: "object", properties: { body: { type: "string" }, fileIds: { type: "array", items: uuidField, description: "Ids from /uploads/complete" } } }),
        responses: { "201": ok({ type: "object" }, "Created"), ...notFound, ...errors },
      },
    },
    "/contracts": {
      get: { ...roles("Contracts", ["admin", "client"]), summary: "Admin: all. Client: those sent to them. Staff: 403", parameters: [{ name: "status", in: "query", schema: { enum: ["draft", "sent", "signed", "cancelled"] } }, { name: "clientId", in: "query", schema: uuidField }, ...paging], responses: { "200": ok(list(ref("Contract"))), ...errors } },
      post: { ...roles("Contracts", ["admin"]), summary: "Draft a contract", requestBody: json(ref("ContractInput")), responses: { "201": ok(ref("Contract"), "Created"), ...errors } },
    },
    "/contracts/templates": { get: { ...roles("Contracts", ["admin"]), summary: "Starting texts; [مشتری] stands for the client's name", responses: { "200": ok(list({ type: "object", properties: { key: { type: "string" }, label: { type: "string" }, title: { type: "string" }, body: { type: "string" } } })), ...errors } } },
    "/contracts/{id}": {
      get: { ...roles("Contracts", ["admin", "client"]), parameters: idPath, responses: { "200": ok(ref("Contract")), ...notFound, ...errors } },
      patch: { ...roles("Contracts", ["admin"]), summary: "Edit a draft (send the whole contract)", parameters: idPath, requestBody: json(ref("ContractInput")), responses: { "200": ok(ref("Contract")), ...conflict, ...errors } },
      delete: { ...roles("Contracts", ["admin"]), summary: "Delete a draft", parameters: idPath, responses: { "200": ok({ type: "object" }), ...conflict, ...errors } },
    },
    "/contracts/{id}/send": { post: { ...roles("Contracts", ["admin"]), summary: "Send a draft for signing (SMS to the client)", parameters: idPath, responses: { "200": ok(ref("Contract")), ...conflict, ...errors } } },
    "/contracts/{id}/withdraw": { post: { ...roles("Contracts", ["admin"]), summary: "Back to draft, or cancel", parameters: idPath, requestBody: json({ type: "object", required: ["to"], properties: { to: { enum: ["draft", "cancelled"] } } }), responses: { "200": ok(ref("Contract")), ...conflict, ...errors } } },
    "/contracts/{id}/sign-code": { post: { ...roles("Contracts", ["client"]), summary: "Text a 6-digit signing code to the client's phone", parameters: idPath, responses: { "200": ok({ type: "object", properties: { sent: { const: true } } }), "429": { description: "too_soon or too_many" }, ...conflict, ...errors } } },
    "/contracts/{id}/sign": {
      post: {
        ...roles("Contracts", ["client"]),
        summary: "Sign with the SMS code; keeps phone, IP, app and a hash of the text",
        parameters: idPath,
        requestBody: json({ type: "object", required: ["signerName", "code", "agree"], properties: { signerName: { type: "string" }, code: { type: "string", pattern: "^\\d{6}$" }, agree: { const: true } } }),
        responses: { "200": ok(ref("Contract")), ...conflict, ...errors },
      },
    },
    "/leads": {
      get: {
        ...roles("CRM", ["admin", "staff"]),
        summary: "The sales pipeline plus its numbers",
        parameters: [
          { name: "stage", in: "query", schema: { enum: ["new", "contacted", "meeting", "proposal", "won", "lost", "open"] } },
          { name: "owner", in: "query", schema: { const: "me" } },
          { name: "due", in: "query", schema: { const: "1" }, description: "Follow-up due today or overdue" },
          { name: "q", in: "query", schema: { type: "string" }, description: "Search name, business, phone, Instagram" },
          ...paging,
        ],
        responses: { "200": ok({ type: "object", properties: { items: { type: "array", items: ref("Lead") }, stats: { type: "object", properties: { open: { type: "integer" }, openValue: { type: "integer" }, wonCount: { type: "integer" }, wonValue: { type: "integer" }, winRate: { type: ["number", "null"] }, bySource: { type: "object" } } } } }), ...errors },
      },
      post: { ...roles("CRM", ["admin", "staff"]), summary: "Add a lead (owned by me unless ownerId is given)", requestBody: json(ref("LeadInput")), responses: { "201": ok(ref("Lead"), "Created"), ...errors } },
    },
    "/leads/{id}": {
      get: { ...roles("CRM", ["admin", "staff"]), summary: "The lead and its history", parameters: idPath, responses: { "200": ok({ allOf: [ref("Lead"), { type: "object", properties: { activities: { type: "array", items: ref("LeadActivity") } } }] }), ...notFound, ...errors } },
      patch: { ...roles("CRM", ["admin", "staff"]), summary: "Edit (send the whole lead)", parameters: idPath, requestBody: json(ref("LeadInput")), responses: { "200": ok(ref("Lead")), ...errors } },
      delete: { ...roles("CRM", ["admin"]), parameters: idPath, responses: { "200": ok({ type: "object" }), ...errors } },
    },
    "/leads/{id}/stage": { post: { ...roles("CRM", ["admin", "staff"]), summary: "Move to a stage; lost needs a reason", parameters: idPath, requestBody: json({ type: "object", required: ["stage"], properties: { stage: { enum: ["new", "contacted", "meeting", "proposal", "won", "lost"] }, reason: { type: "string" } } }), responses: { "200": ok(ref("Lead")), ...errors } } },
    "/leads/{id}/activities": { post: { ...roles("CRM", ["admin", "staff"]), summary: "Log a call, message, meeting or note", parameters: idPath, requestBody: json({ type: "object", required: ["body"], properties: { kind: { enum: ["note", "call", "message", "meeting"] }, body: { type: "string" }, nextFollowUp: nullable("string", { format: "date" }) } }), responses: { "201": ok(ref("LeadActivity"), "Created"), ...errors } } },
    "/leads/{id}/convert": { post: { ...roles("CRM", ["admin", "staff"]), summary: "Turn into a client (marks won)", parameters: idPath, responses: { "200": ok({ type: "object", properties: { clientId: uuidField, created: { type: "boolean" } } }), ...errors } } },
    "/leads/{id}/follow-up-draft": { post: { ...roles("CRM", ["admin", "staff"]), summary: "AI-written follow-up message in Persian", parameters: idPath, responses: { "200": ok({ type: "object", properties: { message: { type: "string" } } }), "503": { description: "ai_unavailable" }, ...errors } } },
    "/payslips": {
      get: {
        ...roles("Payroll", ["admin", "staff"]),
        summary: "Admin: a month's slips (default this month). Staff: their own paid slips",
        parameters: [{ name: "period", in: "query", schema: { type: "string", examples: ["1405-07"] } }, { name: "userId", in: "query", schema: uuidField }, ...paging],
        responses: { "200": ok({ type: "object", properties: { period: nullable("string"), items: { type: "array", items: ref("Payslip") }, total: { type: "integer" }, unpaid: { type: "integer" } } }), ...errors },
      },
    },
    "/payslips/generate": { post: { ...roles("Payroll", ["admin"]), summary: "Draft or refresh a month's slips from hours, deliveries and leave", requestBody: json({ type: "object", required: ["period"], properties: { period: { type: "string", examples: ["1405-07"] } } }), responses: { "200": ok({ type: "object", properties: { period: { type: "string" }, count: { type: "integer" } } }), ...errors } } },
    "/payslips/{id}": {
      get: { ...roles("Payroll", ["admin", "staff"]), parameters: idPath, responses: { "200": ok(ref("Payslip")), ...notFound, ...errors } },
      patch: { ...roles("Payroll", ["admin"]), summary: "Adjust a draft; net is recalculated", parameters: idPath, requestBody: json({ type: "object", required: ["base", "overtime", "bonus", "deductions"], properties: { base: { type: "integer" }, overtime: { type: "integer" }, bonus: { type: "integer" }, deductions: { type: "integer" }, note: nullable("string") } }), responses: { "200": ok(ref("Payslip")), ...conflict, ...errors } },
      delete: { ...roles("Payroll", ["admin"]), summary: "Delete a draft", parameters: idPath, responses: { "200": ok({ type: "object", properties: { period: { type: "string" } } }), ...conflict, ...errors } },
    },
    "/payslips/{id}/pay": { post: { ...roles("Payroll", ["admin"]), summary: "Record payment as a salary expense; the employee is notified", parameters: idPath, requestBody: json({ type: "object", required: ["accountId", "day"], properties: { accountId: uuidField, day: { type: "string", format: "date" } } }), responses: { "200": ok(ref("Payslip")), ...conflict, ...errors } } },
    "/finance/accounts": { get: { ...roles("Payroll", ["admin"]), summary: "Accounts a salary can be paid from", responses: { "200": ok(list({ type: "object", properties: { id: uuidField, name: { type: "string" }, kind: { type: "string" }, active: { type: "boolean" }, lockedThrough: nullable("string") } })), ...errors } } },
    "/reports": {
      get: { tags: ["Client", "Team"], summary: "Monthly reports. Client: those sent to them", parameters: [{ name: "clientId", in: "query", schema: { type: "string" } }, { name: "period", in: "query", schema: { type: "string" } }, ...paging], responses: { "200": ok(list(ref("ReportSummary"))), ...errors } },
    },
    "/reports/{id}": {
      get: { tags: ["Client", "Team"], summary: "Full report; pdfUrl opens the printable page", parameters: idPath, responses: { "200": ok({ type: "object" }), ...errors } },
    },
  },
} as const;
