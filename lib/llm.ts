import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";

// The only module that talks to the LLM provider (Gemini, ADR-0004). Two shapes:
// generateJson (structured output) and runToolLoop (manual function-calling loop).

export const MODELS = {
  research: () => process.env.MODEL_RESEARCH || "gemini-3.8-flash",
  synth: () => process.env.MODEL_SYNTH || "gemini-3.8-flash",
  verify: () => process.env.MODEL_VERIFY || "gemini-3.5-flash-lite",
};

export type Usage = { inputTokens: number; outputTokens: number; calls: number };
export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, calls: 0 });

let client: GoogleGenAI | null = null;
function gemini() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

function addUsage(usage: Usage | undefined, meta: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined) {
  if (!usage) return;
  usage.calls += 1;
  usage.inputTokens += meta?.promptTokenCount ?? 0;
  usage.outputTokens += (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
}

/** One call, JSON out, validated by zod. Retries once with the validation error. */
export async function generateJson<T>(opts: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  thinking?: ThinkingLevel;
  usage?: Usage;
}): Promise<T> {
  const responseJsonSchema = z.toJSONSchema(opts.schema, { target: "draft-2020-12", unrepresentable: "any" });
  const contents: Content[] = [{ role: "user", parts: [{ text: opts.prompt }] }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await gemini().models.generateContent({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema,
        thinkingConfig: { thinkingLevel: opts.thinking ?? ThinkingLevel.LOW },
      },
    });
    addUsage(opts.usage, res.usageMetadata);
    const text = res.text ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data;
    contents.push(
      { role: "model", parts: [{ text }] },
      { role: "user", parts: [{ text: `That output failed validation:\n${z.prettifyError(parsed.error)}\nReturn corrected JSON only.` }] },
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

/**
 * Manual function-calling loop. Ends when the model replies without calling a tool,
 * when `stop()` returns true, or at the deadline. Returns the model's final text.
 */
export async function runToolLoop(opts: {
  model: string;
  system: string;
  prompt: string;
  tools: LoopTool[];
  maxTurns: number;
  deadline?: number;
  stop?: () => boolean;
  thinking?: ThinkingLevel;
  usage?: Usage;
}): Promise<{ text: string; stoppedBy: "done" | "stop" | "deadline" | "max_turns" }> {
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const functionDeclarations: FunctionDeclaration[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: z.toJSONSchema(t.parameters, { target: "draft-2020-12", unrepresentable: "any" }),
  }));
  const contents: Content[] = [{ role: "user", parts: [{ text: opts.prompt }] }];

  for (let turn = 0; turn < opts.maxTurns; turn++) {
    if (opts.deadline && Date.now() > opts.deadline) return { text: "", stoppedBy: "deadline" };
    const res = await gemini().models.generateContent({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.system,
        tools: [{ functionDeclarations }],
        thinkingConfig: { thinkingLevel: opts.thinking ?? ThinkingLevel.LOW },
      },
    });
    addUsage(opts.usage, res.usageMetadata);
    const calls = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (!calls.length || !modelContent) return { text: res.text ?? "", stoppedBy: "done" };
    contents.push(modelContent); // keep the model turn as-is (thought signatures included)

    const results = await Promise.all(
      calls.map(async (call) => {
        const tool = byName.get(call.name ?? "");
        let response: Record<string, unknown>;
        if (!tool) response = { error: `Unknown tool ${call.name}` };
        else {
          const args = tool.parameters.safeParse(call.args ?? {});
          if (!args.success) response = { error: z.prettifyError(args.error) };
          else {
            try {
              response = { output: await tool.run(args.data) };
            } catch (e) {
              response = { error: (e as Error).message };
            }
          }
        }
        return { functionResponse: { id: call.id, name: call.name, response } };
      }),
    );
    contents.push({ role: "user", parts: results });
    if (opts.stop?.()) return { text: "", stoppedBy: "stop" };
  }
  return { text: "", stoppedBy: "max_turns" };
}
