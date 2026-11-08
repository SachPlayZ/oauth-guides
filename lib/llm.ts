import { z } from "zod";

// The only module that talks to an LLM (ADR-0004). One OpenAI-compatible backend; models are
// "provider:model" and each role is a fallback chain. Two shapes: generateJson (JSON out)
// and runToolLoop (manual function-calling loop).
//
// Groq free tier (checked 2026-11-09 via response headers): 1,000 requests/day and
// 8,000 tokens/minute per model. Requests must stay small, so tool output is truncated
// and old tool results are trimmed as the conversation grows.

const PROVIDERS: Record<string, { baseUrl: string; keyEnv: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
};

const chain = (env: string | undefined, fallback: string) =>
  (env || fallback).split(",").map((m) => m.trim()).filter(Boolean);
export const MODELS = {
  research: () => chain(process.env.MODEL_RESEARCH, "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b"),
  synth: () => chain(process.env.MODEL_SYNTH, "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b"),
  verify: () => chain(process.env.MODEL_VERIFY, "groq:openai/gpt-oss-20b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b"),
};

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_WAIT_MS = 20_000; // longest we wait for a per-minute limit to reset
/** Rough budget for one request (prompt + output) under an 8K tokens/minute limit. */
export const MAX_REQUEST_TOKENS = 6_500;
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export type Usage = { inputTokens: number; outputTokens: number; calls: number };
export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, calls: 0 });

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ChatResponse = {
  choices: { message: { content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

const exhausted = new Set<string>(); // models out of their daily quota for this process

async function chatOnce(model: string, body: object): Promise<ChatResponse> {
  const [provider, ...rest] = model.split(":");
  const p = PROVIDERS[provider];
  if (!p || !rest.length) throw new Error(`Unknown model "${model}" (expected provider:model)`);
  const key = process.env[p.keyEnv];
  if (!key) throw new Error(`${p.keyEnv} is not set`);
  const id = rest.join(":");
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...body, model: id, ...(id.includes("gpt-oss") ? { reasoning_effort: "low" } : {}) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new LlmError(`${model} → HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
  }
  return res.json() as Promise<ChatResponse>;
}

/**
 * Try each model in turn. Per-minute limits move on to the next model; if every model is
 * waiting on one, sleep for the shortest reset (≤ 20s) and go round again. Daily limits
 * drop the model for the rest of the process. `state.index` keeps a loop on one model.
 */
async function chat(models: string[], body: object, state = { index: 0 }, usage?: Usage): Promise<ChatResponse> {
  let lastError: unknown;
  for (let round = 0; round < 3; round++) {
    let shortestWait = Infinity;
    for (let k = 0; k < models.length; k++) {
      const i = (state.index + k) % models.length;
      if (exhausted.has(models[i])) continue;
      try {
        const res = await chatOnce(models[i], body);
        state.index = i;
        if (usage) {
          usage.calls += 1;
          usage.inputTokens += res.usage?.prompt_tokens ?? 0;
          usage.outputTokens += res.usage?.completion_tokens ?? 0;
        }
        return res;
      } catch (e) {
        lastError = e;
        if (process.env.DEBUG_LLM) console.error(`[llm] ${models[i]} →`, (e as Error).message.slice(0, 200));
        if (!(e instanceof LlmError)) {
          if ((e as Error).name === "TimeoutError") continue;
          throw e;
        }
        if (e.status === 429 && /per day|\bTPD\b|\bRPD\b/i.test(e.message)) exhausted.add(models[i]);
        else if (e.status === 429) shortestWait = Math.min(shortestWait, e.retryAfterMs ?? 5000);
        else if (e.status === 413) throw new Error(`Request too large for ${models[i]}; trim the prompt. ${e.message}`);
        else if (e.status >= 500 || e.status === 400) continue; // 400: e.g. a malformed tool call; another model may do better
        else throw e;
      }
    }
    if (!Number.isFinite(shortestWait) || shortestWait > MAX_WAIT_MS) break;
    await new Promise((r) => setTimeout(r, shortestWait));
  }
  throw new Error(`All models failed (${models.join(", ")}): ${(lastError as Error)?.message ?? lastError}`);
}

const jsonSchemaOf = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));

/** One call, JSON out, validated by zod. Retries once with the validation error. */
export async function generateJson<T>(opts: {
  models: string[];
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  usage?: Usage;
}): Promise<T> {
  const messages: Message[] = [
    { role: "system", content: `${opts.system}\n\nReply with only a JSON object matching this JSON Schema:\n${jsonSchemaOf(opts.schema)}` },
    { role: "user", content: opts.prompt },
  ];
  const state = { index: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat(opts.models, { messages, response_format: { type: "json_object" }, max_tokens: opts.maxTokens ?? 2048 }, state, opts.usage);
    const text = res.choices[0]?.message.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data;
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `That output failed validation:\n${z.prettifyError(parsed.error)}\nReturn corrected JSON only.` },
    );
  }
  throw new Error("Model output failed schema validation twice");
}

export type LoopTool = {
  name: string;
  description: string;
  parameters: z.ZodType;
  /** Returns what the model sees as the tool result. Throwing reports the error to the model. */
  run: (args: unknown) => Promise<unknown>;
};

/** Keep the conversation under the request budget: shorten the oldest tool results first. */
function trimToBudget(messages: Message[], budget: number) {
  const size = () => messages.reduce((n, m) => n + estimateTokens(JSON.stringify(m)), 0);
  for (const m of messages) {
    if (size() <= budget) return;
    if (m.role === "tool" && m.content.length > 200) m.content = `${m.content.slice(0, 200)}… [trimmed to save tokens]`;
  }
}

/**
 * Manual function-calling loop. Ends when the model replies without calling a tool,
 * when `stop()` returns true, or at the deadline. Returns the model's final text.
 */
export async function runToolLoop(opts: {
  models: string[];
  system: string;
  prompt: string;
  tools: LoopTool[];
  maxTurns: number;
  deadline?: number;
  stop?: () => boolean;
  maxToolResultChars?: number;
  usage?: Usage;
}): Promise<{ text: string; stoppedBy: "done" | "stop" | "deadline" | "max_turns" }> {
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const tools = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.parameters, { unrepresentable: "any" }) },
  }));
  const messages: Message[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];
  const state = { index: 0 };
  const maxChars = opts.maxToolResultChars ?? 6_000;
  let nudged = false;

  for (let turn = 0; turn < opts.maxTurns; turn++) {
    if (opts.deadline && Date.now() > opts.deadline) return { text: "", stoppedBy: "deadline" };
    trimToBudget(messages, MAX_REQUEST_TOKENS - 1_500);
    const res = await chat(opts.models, { messages, tools, tool_choice: "auto", max_tokens: 1_500 }, state, opts.usage);
    const msg = res.choices[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) {
      // Models sometimes write the final report as text. If the caller is waiting on a tool, ask once more.
      if (opts.stop && !opts.stop() && !nudged) {
        nudged = true;
        messages.push(
          { role: "assistant", content: msg?.content ?? "" },
          { role: "user", content: "Don't answer in text. Call the tool that reports your result now." },
        );
        continue;
      }
      return { text: msg?.content ?? "", stoppedBy: "done" };
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    for (const call of calls) {
      const tool = byName.get(call.function.name);
      let output: unknown;
      if (!tool) output = { error: `Unknown tool ${call.function.name}` };
      else {
        let raw: unknown;
        try {
          raw = JSON.parse(call.function.arguments || "{}");
        } catch {
          raw = undefined;
        }
        const args = tool.parameters.safeParse(raw);
        if (!args.success) output = { error: z.prettifyError(args.error) };
        else {
          try {
            output = await tool.run(args.data);
          } catch (e) {
            output = { error: (e as Error).message };
          }
        }
      }
      const content = typeof output === "string" ? output : JSON.stringify(output);
      messages.push({ role: "tool", tool_call_id: call.id, content: content.length > maxChars ? `${content.slice(0, maxChars)}… [truncated]` : content });
    }
    if (opts.stop?.()) return { text: "", stoppedBy: "stop" };
  }
  return { text: "", stoppedBy: "max_turns" };
}
