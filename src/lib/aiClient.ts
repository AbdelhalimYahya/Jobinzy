/**
 * AI client — the ONLY module that constructs AI HTTP requests.
 *
 * Responsibilities (phases 2.4, 3.4/3.5, 3.7, 10.3):
 * - `generate()` — one OpenAI-compatible chat completion request.
 * - `testConnection()` — validates stored/entered settings (3.4).
 * - A simple in-module concurrency limiter so a form with many open-ended
 *   questions never fires a burst of simultaneous requests (3.7).
 * - `withRetry()` — shared retry helper used by every AI call (10.3).
 *
 * Every feature that needs AI output (CV parsing, open-ended answers,
 * rewrites) goes through this module — no raw `fetch` to an AI endpoint
 * anywhere else.
 */
import type { AISettings } from "./types";

/** Cap prompt/response sizes so long CVs don't silently overflow context. */
export const MAX_PROMPT_CHARS = 12000;
export const DEFAULT_MAX_TOKENS = 600;
/** Max concurrent in-flight generate() calls (3.7). */
export const MAX_CONCURRENT_REQUESTS = 2;
/** Default timeouts. */
export const REQUEST_TIMEOUT_MS = 60_000;
export const TEST_TIMEOUT_MS = 15_000;

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

export function buildRequestUrl(settings: AISettings): string {
  let base = settings.baseUrl.replace(/\/+$/, "");
  // Tolerate a base URL that already ends in /chat/completions (3.3 note).
  if (!base.endsWith("/chat/completions")) {
    base += "/chat/completions";
  }
  return base;
}

/** Shared request construction — the single place a chat request is built. */
async function requestCompletion(
  settings: AISettings,
  prompt: string,
  opts: GenerateOptions,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(buildRequestUrl(settings), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.7,
    }),
  });
}

/**
 * Sends a single chat completion request against an OpenAI-compatible
 * endpoint (NVIDIA NIM or any BYO provider — same function, swapped URL/key).
 * Throws on network error, non-OK status, or a malformed response body.
 * Transient failures (network, 5xx, rate-limit) are retried once (10.3).
 */
export async function generate(
  prompt: string,
  settings: AISettings,
  opts: GenerateOptions = {}
): Promise<string> {
  return runWithConcurrencyLimit(() =>
    withRetry(() => generateOnce(prompt, settings, opts), 1, RETRY_DELAY_MS, isRetryable)
  );
}

/** The actual single attempt behind generate() (wrapped by 10.3 retry). */
async function generateOnce(
  prompt: string,
  settings: AISettings,
  opts: GenerateOptions
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await requestCompletion(settings, prompt, opts, controller.signal);

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body?.error?.message ?? JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new HttpStatusError(res.status, `AI request failed (${res.status}): ${detail}`);
    }

    const data: unknown = await res.json();
    const content = extractContent(data);
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("AI response did not contain a text completion");
    }
    return content.trim();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends a minimal trivial prompt to verify settings. Never throws — returns
 * a human-readable result message for the UI (3.4). Transient failures
 * (network, 5xx, rate-limit) are retried once (10.3) before the final
 * failure is classified.
 */
export async function testConnection(
  settings: AISettings
): Promise<{ ok: boolean; message: string }> {
  if (!settings.apiKey) {
    return { ok: false, message: "Enter an API key first, then test the connection." };
  }
  if (!settings.baseUrl) {
    return { ok: false, message: "Enter a base URL first, then test the connection." };
  }
  // Single user action — intentionally NOT routed through the concurrency
  // limiter (that exists to throttle bulk answer generation, not one click).
  try {
    await withRetry(() => runTestRequest(settings), 1, RETRY_DELAY_MS, isRetryable);
    return { ok: true, message: "Connection successful — AI provider reached." };
  } catch (err) {
    const status = err instanceof HttpStatusError
      ? err.status
      : err instanceof Error && err.name === "AbortError"
        ? 0
        : undefined;
    return { ok: false, message: classifyFailure(status, messageOf(err)) };
  }
}

/** One test-connection attempt; throws HttpStatusError on a non-OK reply. */
async function runTestRequest(settings: AISettings): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const res = await requestCompletion(
      settings,
      "Reply with the single word OK.",
      { maxTokens: 8, temperature: 0 },
      controller.signal
    );
    if (!res.ok) {
      throw new HttpStatusError(res.status, `HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function classifyFailure(status: number | undefined, detail: string): string {
  if (status === 0) return "Timed out — check the base URL and your connection.";
  if (status === 401 || status === 403) return "Invalid API key — please check it.";
  if (status === 429) return "Rate limited — try again in a moment.";
  if (status === 404) return "Endpoint not found — check the base URL.";
  if (status && status >= 500) return `Provider error (HTTP ${status}) — try again later.`;
  // Network-level failures (fetch throws TypeError "Failed to fetch").
  return `Couldn't reach the AI provider — ${detail || "network error"}.`;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Concurrency limiter (3.7) --------------------------------------------

let inFlight = 0;
const waiters: Array<() => void> = [];

/**
 * Runs `fn` while guaranteeing no more than MAX_CONCURRENT_REQUESTS of these
 * callbacks are in flight at once; the rest queue and run as slots free up.
 */
export async function runWithConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_CONCURRENT_REQUESTS) {
    inFlight++;
    try {
      return await fn();
    } finally {
      inFlight--;
      releaseWaiter();
    }
  }
  return new Promise<T>((resolve, reject) => {
    waiters.push(() => {
      void runWithConcurrencyLimit(fn).then(resolve, reject);
    });
  });
}

function releaseWaiter(): void {
  const next = waiters.shift();
  if (next) next();
}

// ---- Retry helper (10.3) ---------------------------------------------------

/** HTTP status-carrying error, so failures can be classified & retried. */
class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

/** Short backoff between automatic retries (kept small for a snappy UI). */
const RETRY_DELAY_MS = 500;

/**
 * Which failures are worth retrying: network-level errors (TypeError),
 * rate-limits (429) and server errors (5xx). Auth (401/403), validation
 * (400) and timeouts are permanent — no point hammering the provider.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof HttpStatusError) return err.status === 429 || err.status >= 500;
  if (err instanceof Error) {
    if (err.name === "AbortError") return false;
    const m = /\((\d{3})\)/.exec(err.message);
    if (m) {
      const status = Number(m[1]);
      return status === 429 || status >= 500;
    }
  }
  return false;
}

/**
 * Retries `fn` up to `retries` times on failure, with a short backoff.
 * `shouldRetryFn` decides which failures are worth retrying (default: all).
 * Used by generate(), testConnection() and cvParser's structureCv so retry
 * behavior isn't reimplemented per feature.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 800,
  shouldRetryFn: (err: unknown) => boolean = () => true
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && shouldRetryFn(err)) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      } else if (attempt < retries) {
        break; // non-retryable — give up immediately
      }
    }
  }
  throw lastErr;
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
