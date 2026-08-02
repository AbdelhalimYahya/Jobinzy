/**
 * AI client — the ONLY module that constructs AI HTTP requests.
 *
 * Phase 2: minimal `generate()` so cvParser's `structureCv` can work.
 * Phase 3 expands this module with `testConnection`, a concurrency limiter,
 * and centralized retry handling (10.3). Every feature that needs AI output
 * (CV parsing, open-ended answers, rewrites) must go through this module —
 * no raw `fetch` to an AI endpoint anywhere else.
 */
import type { AISettings } from "./types";

/** Cap prompt/response sizes so long CVs don't silently overflow context. */
export const MAX_PROMPT_CHARS = 12000;
export const DEFAULT_MAX_TOKENS = 600;

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

function buildRequestUrl(settings: AISettings): string {
  const base = settings.baseUrl.replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

/**
 * Sends a single chat completion request against an OpenAI-compatible
 * endpoint (NVIDIA NIM or any BYO provider — same function, swapped URL/key).
 * Throws on network error, non-OK status, or a malformed response body.
 */
export async function generate(
  prompt: string,
  settings: AISettings,
  opts: GenerateOptions = {}
): Promise<string> {
  const res = await fetch(buildRequestUrl(settings), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`AI request failed (${res.status}): ${detail}`);
  }

  const data: unknown = await res.json();
  const content = extractContent(data);
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("AI response did not contain a text completion");
  }
  return content.trim();
}

function extractContent(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return undefined;
  const obj = data as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return undefined;
  return (message as Record<string, unknown>).content;
}

/**
 * Trims prompt input to MAX_PROMPT_CHARS so a very long CV can't overflow
 * the model context window. Used by every feature that builds prompts from
 * user data.
 */
export function trimPrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  return prompt.slice(0, MAX_PROMPT_CHARS);
}
