/**
 * Fill engine — Phase 9 module, but a functional core is built during
 * Phase 8 because the panel's "Fill form" action (8.4) depends on it.
 *
 * Core capabilities delivered here (9.1/9.2/9.4/9.6):
 * - 9.1 `fillField` for inputs/textareas via the NATIVE value setter, then
 *   native `input` + `change` events (required for React-controlled forms).
 * - 9.2 `fillSelect` — exact match first, case-insensitive substring
 *   fallback; no match → reports back instead of picking an arbitrary option.
 * - 9.4 `flashHighlight` + `scrollIntoViewIfNeeded` — visual fill feedback.
 * - 9.6 `verifyFilled` — re-reads the element after filling so the panel can
 *   flag values a page script reset (mismatch warning, not false success).
 *
 * Phase 9 expands this with best-effort custom-widget (role="combobox")
 * filling, per-field undo snapshots, and skip-state checks centralized here.
 */
import type { DetectedField } from "./types";

export interface FillResult {
  ok: boolean;
  message?: string;
}

/** How long the fill highlight stays visible (plan 9.4, ~600ms). */
const HIGHLIGHT_MS = 600;

/**
 * 9.1 — sets a value through the native property setter so React-controlled
 * inputs register the change (plain `el.value = v` does not trigger React).
 */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/** Dispatches native `input` then `change` (bubbles) so frameworks see it. */
export function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fills a standard input or textarea. */
export function fillTextInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): FillResult {
  setNativeValue(el, value);
  dispatchInputEvents(el);
  return { ok: true };
}

/**
 * 9.2 — fills a <select>. Exact option match first, then case-insensitive
 * substring against both text and value. No match → { ok: false } so the
 * panel can tell the user instead of silently picking an arbitrary option.
 */
export function fillSelect(el: HTMLSelectElement, value: string): FillResult {
  const options = Array.from(el.options);
  const exact = options.find(
    (o) => o.value === value || o.text.trim() === value.trim()
  );
  const match =
    exact ??
    options.find((o) =>
      `${o.text} ${o.value}`.toLowerCase().includes(value.toLowerCase())
    );
  if (!match) {
    return {
      ok: false,
      message: "No matching option in this dropdown — please select it manually.",
    };
  }
  el.value = match.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

/**
 * 8.4/9.1 — main entry: scrolls to + highlights the element, then fills it
 * according to its element type. Returns a per-field result so the panel
 * (and later the post-fill validation pass) can react to failures.
 */
export function fillField(field: DetectedField, value: string): FillResult {
  const el = field.elementRef;
  scrollIntoViewIfNeeded(el);
  flashHighlight(el);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return fillTextInput(el, value);
  }
  if (el instanceof HTMLSelectElement) {
    return fillSelect(el, value);
  }
  return {
    ok: false,
    message: "This field type can't be auto-filled — please complete it manually.",
  };
}

/**
 * 9.6 — post-fill validation: re-reads the element and compares against the
 * expected value. A page script that resets the field right after our fill
 * shows up as a mismatch here.
 */
export function verifyFilled(el: HTMLElement, expected: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find(
      (o) => o.value === expected || o.text.trim() === expected.trim()
    );
    return match ? el.value === match.value : el.value === expected;
  }
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  return input.value === expected;
}

/** 9.4 — briefly outlines/highlights a filled or targeted element. */
export function flashHighlight(el: HTMLElement): void {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  const prevBg = el.style.background;
  el.style.outline = "2px solid #4f46e5";
  el.style.outlineOffset = "2px";
  el.style.background = "#eef2ff";
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
    el.style.background = prevBg;
  }, HIGHLIGHT_MS);
}

/** 9.4 — scrolls the element into view (center) if it isn't visible. */
export function scrollIntoViewIfNeeded(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const visible = rect.top >= 0 && rect.bottom <= vh && rect.height > 0;
  if (!visible && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
