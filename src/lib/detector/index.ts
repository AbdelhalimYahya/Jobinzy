/**
 * Field detector — SEED (Phase 4.3).
 *
 * The full detection engine (scan, context extraction, EN+AR rule
 * classification, AI fallback, file/link flagging) is built in Phase 5 in
 * this same module. This seed supports the Phase 4 acceptance: clicking
 * "Detect Form" on a real form returns at least one detected field.
 */
import type { DetectedField, FieldContext } from "../types";

const CANDIDATE_SELECTOR =
  'input, textarea, select, [role="textbox"], [role="combobox"]';

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if ("type" in el && el.getAttribute("type") === "hidden") return false;
  if ((el as HTMLInputElement).disabled) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function collectCandidates(root: Document | ShadowRoot): HTMLElement[] {
  const found: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR).forEach((el) => {
    if (isVisible(el)) found.push(el);
  });
  return found;
}

export function extractContext(el: HTMLElement): FieldContext {
  const ctx: FieldContext = {};
  if (el.id) ctx.id = el.id;
  const name = el.getAttribute("name");
  if (name) ctx.name = name;
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) ctx.ariaLabel = ariaLabel;

  // <label for="..."> association
  if (el.id) {
    const label = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label?.textContent) ctx.labelText = label.textContent.trim();
  }
  // aria-labelledby
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const labelEl = document.getElementById(labelledby);
    if (labelEl?.textContent) ctx.labelText = labelEl.textContent.trim();
  }
  // placeholder
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) ctx.placeholder = placeholder.trim();

  // nearest preceding text sibling/ancestor as a fallback
  if (!ctx.labelText && !ctx.ariaLabel && !ctx.placeholder) {
    const nearby = findNearbyText(el);
    if (nearby) ctx.nearbyText = nearby;
  }
  return ctx;
}

function findNearbyText(el: HTMLElement): string | undefined {
  let node: Element | null = el;
  for (let depth = 0; depth < 4 && node; depth++) {
    const prev = node.previousElementSibling;
    if (prev?.textContent?.trim()) return prev.textContent.trim().slice(0, 120);
    node = node.parentElement;
  }
  return undefined;
}

function cssEscape(id: string): string {
  // Minimal CSS.escape fallback (id used in attribute selector).
  return id.replace(/["\\]/g, "\\$&");
}

/** SEED classifier — Phase 5 replaces this with the full EN+AR engine. */
function classify(ctx: FieldContext): DetectedField["kind"] {
  const haystack = [
    ctx.labelText,
    ctx.ariaLabel,
    ctx.placeholder,
    ctx.nearbyText,
    ctx.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(name|email|phone|national|id|address|link|linkedin|github|portfolio|drive|url)\b/.test(haystack)) {
    return "profile";
  }
  if (/\b(why|tell|describe|explain|about|motivat|fit|goal|strength|experience)\b/.test(haystack)) {
    return "open-ended";
  }
  if (/\b(attach|upload|cv|resume|file|video|portfolio link)\b/.test(haystack)) {
    return "file-or-link";
  }
  return "unknown";
}

/**
 * Seed entry point — returns one DetectedField per visible candidate.
 * Full implementation (dedupe, confidence flags, AI fallback, AR keywords)
 * lands in Phase 5.
 */
export async function detectFields(
  root: Document | ShadowRoot = document
): Promise<DetectedField[]> {
  const candidates = collectCandidates(root);
  const seen = new Set<HTMLElement>();
  const result: DetectedField[] = [];
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    const ctx = extractContext(el);
    result.push({
      elementRef: el,
      kind: classify(ctx),
      questionText: ctx.labelText ?? ctx.ariaLabel ?? ctx.placeholder ?? ctx.nearbyText,
      confidence: "high",
    });
  }
  return result;
}
