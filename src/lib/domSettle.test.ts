import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForDomSettle } from "./domSettle";

describe("waitForDomSettle (10.1)", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("resolves once the DOM has been quiet for the quiet period", async () => {
    vi.useFakeTimers();
    const p = waitForDomSettle(document.body, { quietMs: 100, maxWaitMs: 5000, pollMs: 10 });
    // Trigger one mutation, then go quiet.
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.textContent = "x";
    await vi.advanceTimersByTimeAsync(10);
    // Still waiting (not quiet yet — only 10ms since mutation).
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(200); // well past quietMs
    expect(settled).toBe(true);
  });

  it("resolves via the max-wait cap even with continuous mutations", async () => {
    vi.useFakeTimers();
    const p = waitForDomSettle(document.body, { quietMs: 1000, maxWaitMs: 300, pollMs: 10 });
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    // Keep mutating so quietMs is never reached.
    const el = document.createElement("div");
    document.body.appendChild(el);
    const interval = setInterval(() => {
      el.textContent = String(Math.random());
    }, 20);
    await vi.advanceTimersByTimeAsync(500);
    clearInterval(interval);
    expect(settled).toBe(true);
  });

  it("resolves via the max-wait cap when the root never mutates", async () => {
    vi.useFakeTimers();
    // A detached node IS observable in jsdom, but it never mutates — so the
    // max-wait cap resolves the wait promptly (no real 1s delay).
    const p = waitForDomSettle(document.createElement("div"), {
      quietMs: 5000,
      maxWaitMs: 200,
      pollMs: 10,
    });
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(true);
  });

  it("never rejects when the root can't be observed", async () => {
    // A non-Node root makes MutationObserver.observe throw. The contract is
    // "never rejects" — this also guards the TDZ fix where finish() ran
    // before `interval` was initialized.
    const root = {} as unknown as Node;
    await expect(
      waitForDomSettle(root, { quietMs: 100, maxWaitMs: 100, pollMs: 10 })
    ).resolves.toBeUndefined();
  });
});
