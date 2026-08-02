/**
 * Fill engine — Phase 9.
 *
 * - 9.1 `fillTextInput` — inputs/textareas via the NATIVE value setter, then
 *   native `input` + `change` events (required for React-controlled forms).
 * - 9.2 `fillSelect` — exact match first, case-insensitive substring
 *   fallback; no match → reports back instead of picking an arbitrary option.
 * - 9.3 `fillComboBox` — best-effort custom-widget filling: focus/click to
 *   open, type the value, try to click a matching rendered option within a
 *   short timeout; otherwise clearly reports "complete manually" — never a
 *   silent no-op or an ambiguous half-filled state.
 * - 9.4 `flashHighlight` + `scrollIntoViewIfNeeded` — visual fill feedback.
 * - 9.5 `fillFields` — batch entry point that respects each entry's skip
 *   flag (the panel maps Skip / "I'll do this myself" to skip=true).
 * - 9.6 `verifyFilled` + the post-fill validation pass inside `fillFields`:
 *   after every fill, re-reads each element and flags mismatches (a page
 *   script that resets the value is surfaced, not shown as success).
 *
 * The panel (8.4/8.5) drives this module; it decides which fields to fill
 * and reports per-field results back to the row states.
 */
import type { DetectedField } from "./types";

export interface FillResult {
  ok: boolean;
  message?: string;
  /** The actual value written (what the panel should verify against). */
  value?: string;
}

/** One field to fill, as decided by the panel. skip=false per 9.5. */
export interface FillEntry {
  field: DetectedField;
  value: string;
  skip: boolean;
}

/** Per-field outcome of a batch fill, including the 9.6 verification. */
export interface FillEntryResult {
  field: DetectedField;
  ok: boolean;
  message?: string;
  /** The actual value written (compared against by the 9.6 pass). */
  value?: string;
  /** True when the page reset/ignored the value right after filling (9.6). */
  mismatch?: boolean;
}

/** How long the fill highlight stays visible (plan 9.4, ~600ms). */
const HIGHLIGHT_MS = 600;
/** How long to wait for a custom combobox to render a matching option (9.3). */
export const COMBOBOX_WAIT_MS = 1500;

/** Shared user-facing message when a field genuinely can't be auto-filled. */
const CANNOT_AUTOFILL_MESSAGE =
  "This field can't be auto-filled — please complete it manually.";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  return { ok: true, value };
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
  return { ok: true, value: match.value };
}

/** True for custom widget fields that need the 9.3 best-effort path. */
function isCustomWidget(el: HTMLElement): boolean {
  return (
    el.getAttribute("role") === "combobox" ||
    el.getAttribute("role") === "listbox" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.isContentEditable
  );
}

/**
 * 9.3 — best-effort fill for custom widgets (role="combobox" etc.):
 * focus + click to open, type the value, then try to select a matching
 * rendered option if one appears within the timeout. If nothing matches,
 * reports back that the field needs manual completion — the panel shows
 * that status instead of leaving an ambiguous half-filled field.
 */
export async function fillComboBox(
  el: HTMLElement,
  value: string,
  opts?: { waitMs?: number }
): Promise<FillResult> {
  el.focus();
  el.click();

  // Type the value into whatever text surface the widget exposes.
  if (el instanceof HTMLInputElement) {
    setNativeValue(el, value);
    dispatchInputEvents(el);
  } else if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    dispatchInputEvents(el);
  } else {
    return {
      ok: false,
      message: "This widget can't be auto-filled — please complete it manually.",
    };
  }

  // Try to select a matching rendered option within the timeout.
  const deadline = Date.now() + (opts?.waitMs ?? COMBOBOX_WAIT_MS);
  while (Date.now() < deadline) {
    const option = findComboboxOption(value);
    if (option) {
      option.click();
      return { ok: true, value };
    }
    await delay(50);
  }
  return {
    ok: false,
    message: "Couldn't auto-fill this dropdown — please select an option manually.",
  };
}

/**
 * Finds a rendered option element whose text matches the target value.
 * Prefers ARIA-annotated options and listbox items; bare `li` elements are
 * only consulted as a last resort, since an unrelated page list (e.g. a nav
 * menu) could otherwise be clicked. Best-effort per 9.3 — the timeout +
 * manual-completion fallback covers the cases where nothing safely matches.
 */
function findComboboxOption(value: string): HTMLElement | null {
  const needle = value.trim().toLowerCase();
  const prefers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="option"], [role="listbox"] li, select option'
    )
  );
  const preferred =
    prefers.find((o) => o.textContent?.trim().toLowerCase() === needle) ??
    prefers.find((o) => o.textContent?.trim().toLowerCase().includes(needle));
  if (preferred) return preferred;
  // Last resort: a bare list item exactly matching the target.
  return (
    Array.from(document.querySelectorAll<HTMLElement>("li")).find(
      (o) => o.textContent?.trim().toLowerCase() === needle
    ) ?? null
  );
}

/** Reads the current value of any fillable element. */
export function readElementValue(el: HTMLElement): string {
  if (el instanceof HTMLSelectElement) return el.value;
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  return typeof input.value === "string" ? input.value : "";
}

/** One element + the value it held at snapshot time (10.6 undo). */
export interface ValueSnapshot {
  element: HTMLElement;
  value: string;
}

/**
 * 10.6 — captures the current values of a set of elements, so a later fill
 * can be undone. Used by the panel's "Undo fill" action.
 */
export function captureValues(elements: HTMLElement[]): ValueSnapshot[] {
  return elements.map((el) => ({ element: el, value: readElementValue(el) }));
}

/**
 * 10.6 — restores a snapshot of values back into the page, dispatching the
 * same native events a normal fill would so framework-bound forms update.
 */
export function restoreValues(snapshot: ValueSnapshot[]): void {
  for (const { element, value } of snapshot) {
    if (element instanceof HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      continue;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNativeValue(element, value);
      dispatchInputEvents(element);
    }
  }
}

/**
 * 8.4/9.5/9.6 — fills a batch of fields, respecting each entry's skip flag,
 * then runs the post-fill validation pass (re-read every filled element and
 * flag mismatches). The panel calls this from its "Fill form" action.
 */
export async function fillFields(entries: FillEntry[]): Promise<FillEntryResult[]> {
  const results: FillEntryResult[] = [];

  for (const entry of entries) {
    // 9.5 — a skipped field is never touched, even though a value exists.
    if (entry.skip) continue;

    const el = entry.field.elementRef;
    scrollIntoViewIfNeeded(el);
    flashHighlight(el);

    if (isCustomWidget(el)) {
      const r = await fillComboBox(el, entry.value);
      results.push({ field: entry.field, ok: r.ok, message: r.message, value: r.value });
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const r = fillTextInput(el, entry.value);
      results.push({ field: entry.field, ok: r.ok, message: r.message, value: r.value });
    } else if (el instanceof HTMLSelectElement) {
      const r = fillSelect(el, entry.value);
      results.push({ field: entry.field, ok: r.ok, message: r.message, value: r.value });
    } else {
      results.push({ field: entry.field, ok: false, message: CANNOT_AUTOFILL_MESSAGE });
    }
  }

  // 9.6 — post-fill validation: re-read each filled element and compare
  // against the value we believe we wrote, via verifyFilled (single source
  // of truth, including the select option-matching case).
  for (const res of results) {
    if (!res.ok || res.value === undefined) continue;
    res.mismatch = !verifyFilled(res.field.elementRef, res.value);
  }

  return results;
}

/**
 * 8.4/9.1 — single-field fill (also used for post-fill row edits, 8.5).
 * Synchronous for standard fields; custom widgets return ok:false here and
 * are handled by the async batch path in fillFields.
 */
export function fillField(field: DetectedField, value: string): FillResult {
  const el = field.elementRef;
  scrollIntoViewIfNeeded(el);
  flashHighlight(el);
  if (isCustomWidget(el)) {
    return { ok: false, message: CANNOT_AUTOFILL_MESSAGE };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return fillTextInput(el, value);
  }
  if (el instanceof HTMLSelectElement) {
    return fillSelect(el, value);
  }
  return { ok: false, message: CANNOT_AUTOFILL_MESSAGE };
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
  return readElementValue(el) === expected;
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
