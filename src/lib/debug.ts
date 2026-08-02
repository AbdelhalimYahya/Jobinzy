/**
 * Dev-only logging (Phase 13.1).
 *
 * In production (`vite build`), `import.meta.env.PROD` is statically replaced
 * with `true`, so these helpers compile to no-ops and no console output ships
 * in the store bundle (acceptance: "no console noise" in the production zip).
 * In dev/tests they behave exactly like console.log/warn, so debugging and
 * failure diagnostics are unchanged locally.
 *
 * The diagnostic warn calls (CV parse failures, AI fallbacks, failed
 * persistence) are deliberately routed through here rather than removed:
 * they're essential while developing, and gated rather than deleted so
 * production stays silent.
 */
const ENABLED = !import.meta.env.PROD;

export function debugLog(...args: unknown[]): void {
  if (ENABLED) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (ENABLED) console.warn(...args);
}
