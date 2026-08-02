/**
 * Phase 5.2 — extract context per candidate field.
 */
import type { FieldContext } from "../types";

export function extractContext(el: HTMLElement): FieldContext {
  const ctx: FieldContext = {};

  if (el.id) ctx.id = el.id;
  const name = el.getAttribute("name");
  if (name) ctx.name = name;

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) ctx.ariaLabel = ariaLabel.trim();

  // aria-labelledby (may reference one or more ids)
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
    if (text) ctx.labelText = text;
  }

  // <label for="..."> association — scoped to the element's root so labels
  // inside a shadow root (which collectCandidates scans) resolve correctly.
  if (!ctx.labelText && el.id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const label = root.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label?.textContent?.trim()) ctx.labelText = label.textContent.trim();
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) ctx.placeholder = placeholder.trim();

  // Fallback: nearest preceding text sibling/ancestor.
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
    if (prev?.textContent?.trim()) {
      return prev.textContent.trim().replace(/\s+/g, " ").slice(0, 160);
    }
    node = node.parentElement;
  }
  return undefined;
}

function cssEscape(id: string): string {
  // Minimal escaping for use inside an attribute selector string.
  return id.replace(/["\\]/g, "\\$&");
}
