import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_CONCURRENT_REQUESTS,
  MAX_PROMPT_CHARS,
  generate,
  runWithConcurrencyLimit,
  testConnection,
  trimPrompt,
  withRetry,
} from "./aiClient";
import type { AISettings } from "./types";

const settings: AISettings = {
  provider: "byo",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("generate (3.5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the assistant content for a well-formed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Hello!" } }] }))
    );
    await expect(generate("hi", settings)).resolves.toBe("Hello!");
  });

  it("throws a readable error on non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    await expect(generate("hi", settings)).rejects.toThrow(/401/);
  });

  it("throws when the response lacks content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [] })));
    await expect(generate("hi", settings)).rejects.toThrow(/did not contain/);
  });
});

describe("generate retry (10.3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a transient network failure and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "Recovered" } }] })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", settings)).resolves.toBe("Recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 5xx, then surfaces the real error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "still down" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", settings)).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a permanent 401 (bad key)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", settings)).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("testConnection (3.4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports ok on a successful reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "OK" } }] }))
    );
    const result = await testConnection(settings);
    expect(result.ok).toBe(true);
  });

  it("reports a clear invalid-key message on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    );
    const result = await testConnection(settings);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid api key/i);
  });

  it("reports a network-level failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await testConnection(settings);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn't reach/i);
  });

  it("retries a transient network failure and then succeeds (10.3)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "OK" } }] })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await testConnection(settings);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("concurrency limiter (3.7)", () => {
  it("never exceeds MAX_CONCURRENT_REQUESTS in flight", async () => {
    let active = 0;
    let peak = 0;
    const fn = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return peak;
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => runWithConcurrencyLimit(fn)));
    expect(Math.max(...results)).toBeLessThanOrEqual(MAX_CONCURRENT_REQUESTS);
    expect(Math.max(...results)).toBe(MAX_CONCURRENT_REQUESTS);
  });
});

describe("withRetry (10.3 forward)", () => {
  it("retries the given number of times then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, 2, 0)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("succeeds on retry", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, 1, 0)).resolves.toBe("ok");
  });

  it("skips retry when the predicate rejects the error (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, 3, 0, () => false)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("trimPrompt (6.3 forward)", () => {
  it("caps long prompts at MAX_PROMPT_CHARS", () => {
    const long = "x".repeat(MAX_PROMPT_CHARS + 500);
    const trimmed = trimPrompt(long);
    expect(trimmed.length).toBe(MAX_PROMPT_CHARS);
  });

  it("leaves short prompts untouched", () => {
    expect(trimPrompt("short")).toBe("short");
  });
});
