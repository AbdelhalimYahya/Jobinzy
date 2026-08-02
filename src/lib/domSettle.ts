/**
 * 10.1 — DOM stability gate.
 *
 * `waitForDomSettle` waits until the DOM has stopped mutating (a short quiet
 * period) or a hard max wait elapses, so asynchronously-rendered forms
 * (common on Google/Microsoft Forms) are fully present before detection
 * runs. Called from the content script's detect trigger.
 */
export interface SettleOptions {
  /** How long the DOM must stay quiet before resolving (default 300ms). */
  quietMs?: number;
  /** Hard cap on how long to wait even if mutations keep coming (default 2s). */
  maxWaitMs?: number;
  /** How often to check for a quiet period (default 50ms). */
  pollMs?: number;
}

const DEFAULT_QUIET_MS = 300;
const DEFAULT_MAX_WAIT_MS = 2000;
const DEFAULT_POLL_MS = 50;

/**
 * Resolves once the root has been mutation-free for `quietMs`, or after
 * `maxWaitMs` whichever comes first. Never rejects — the content-script
 * trigger uses this as a best-effort gate before calling detectFields().
 */
export function waitForDomSettle(
  root: Node = document,
  opts: SettleOptions = {}
): Promise<void> {
  const quietMs = opts.quietMs ?? DEFAULT_QUIET_MS;
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  return new Promise((resolve) => {
    // Date.now (not performance.now): vitest's fake timers advance Date.now,
    // so tests can fast-forward through the quiet period deterministically.
    let lastMutation = Date.now();
    const started = Date.now();
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      resolve();
    };

    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });

    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    } catch {
      // Some roots can't be observed — resolve now, never reject. No interval
      // exists yet (it's created below), so there is nothing to clean up.
      finish();
      return;
    }

    // The interval clears itself when it finishes, so `finish` never needs
    // to reference `interval` (which would be a TDZ hazard in the catch path
    // above and a prefer-const violation for a single-assignment `let`).
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastMutation >= quietMs || now - started >= maxWaitMs) {
        finish();
        clearInterval(interval);
      }
    }, pollMs);
  });
}
