import "server-only";
import * as z from "zod";

// Claude via the Messages API. From servers in Iran, point ANTHROPIC_BASE_URL
// at the foreign relay. AI_DRIVER=mock answers locally for development.
const DEFAULT_MODEL = "claude-sonnet-5-5";

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

export async function askClaude<T extends z.ZodType>(opts: AskOptions<T>): Promise<z.infer<T>> {
  if (process.env.AI_DRIVER === "mock") return opts.schema.parse(opts.mock());
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");

  const base = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: inputSchema(opts.schema) }],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === opts.toolName);
  if (!call) throw new Error("Claude returned no structured answer");
  return opts.schema.parse(call.input);
}
