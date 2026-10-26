import "server-only";
import * as z from "zod";

// Claude via the Messages API. From servers in Iran, point ANTHROPIC_BASE_URL
// at the foreign relay. AI_DRIVER=mock answers locally for development.
const DEFAULT_MODEL = "claude-opus-5-5";

export class AiUnavailableError extends Error {}

export function aiConfigured(): boolean {
  return process.env.AI_DRIVER === "mock" || !!process.env.ANTHROPIC_API_KEY;
}

type AskOptions<T extends z.ZodType> = {
  system: string;
  prompt: string;
  // The answer's shape: Claude is made to call a tool with this input
  schema: T;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
  mock: () => z.infer<T>;
};

function inputSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

// Content blocks come back as they are; callers that loop pass them back unchanged
export type ApiBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown; [key: string]: unknown };
export type ApiMessage = { role: "user" | "assistant"; content: string | ApiBlock[] };
export type ApiTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type ApiResponse = { content: ApiBlock[]; stop_reason: string | null };

// One Messages API request. A declined request is retried on a fallback model
// server-side (fallbacks: "default"), so a refusal here means every model declined.
export async function callClaude(req: {
  system: string;
  messages: ApiMessage[];
  tools?: ApiTool[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<ApiResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  const base = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 16000,
      output_config: { effort: req.effort ?? "medium" },
      fallbacks: "default",
      system: req.system,
      messages: req.messages,
      ...(req.tools ? { tools: req.tools, tool_choice: { type: "auto" } } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as ApiResponse;
  if (body.stop_reason === "refusal") throw new Error("Claude declined this request");
  return body;
}

export async function askClaude<T extends z.ZodType>(opts: AskOptions<T>): Promise<z.infer<T>> {
  if (process.env.AI_DRIVER === "mock") return opts.schema.parse(opts.mock());
  // Current models don't accept a forced tool choice, so the prompt asks for the tool
  const body = await callClaude({
    system: `${opts.system}\n\nGive your answer only by calling the ${opts.toolName} tool, once.`,
    messages: [{ role: "user", content: opts.prompt }],
    tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: inputSchema(opts.schema) }],
    maxTokens: Math.max(opts.maxTokens ?? 0, 8000),
  });
  const call = body.content.find((c) => c.type === "tool_use" && c.name === opts.toolName);
  if (!call) throw new Error("Claude returned no structured answer");
  return opts.schema.parse(call.input);
}
