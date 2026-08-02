/**
 * Phase 5.1 — DOM candidate scanner.
 *
 * Walks the DOM via querySelectorAll plus manual recursion into any OPEN
 * shadow roots it encounters, collecting `input`, `textarea`, `select`, and
 * elements with role="textbox" or role="combobox".
 *
 * Phase 10.2 — also recurses into same-origin iframes (contentDocument,
 * guarded in a try/catch). Cross-origin iframes are surfaced separately by
 * `findBlockedIframes` so the panel can tell the user those fields exist
 * but can't be read, instead of silently omitting them.
 */
const CANDIDATE_SELECTOR =
  'input, textarea, select, [role="textbox"], [role="combobox"]';

export function collectCandidates(root: Document | ShadowRoot): HTMLElement[] {
  const found: HTMLElement[] = [];
  walk(root, found);
  return found;
}

function walk(root: Document | ShadowRoot, found: HTMLElement[]): void {
  root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR).forEach((el) => found.push(el));

  // Recurse into open shadow roots (e.g. a form widget implemented with
  // web components).
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.shadowRoot) {
      walk(el.shadowRoot, found);
    }
  });

  // 10.2 — same-origin iframes: scan their documents too. A SecurityError
  // (cross-origin) is caught and the iframe is reported via
  // findBlockedIframes instead.
  root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
    try {
      if (iframe.contentDocument) {
        walk(iframe.contentDocument, found);
      }
    } catch {
      /* cross-origin — reported by the content script via findBlockedIframes */
    }
  });
}

/**
 * Phase 10.2 — iframes whose document can't be read (cross-origin, or a
 * same-origin frame that hasn't finished loading). The detector surfaces a
 * "can't access this embedded form" note for each of these instead of
 * silently omitting the fields inside them.
 */
export function findBlockedIframes(
  root: Document | ShadowRoot
): HTMLIFrameElement[] {
  const blocked: HTMLIFrameElement[] = [];
  root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
    let accessible = false;
    try {
      accessible = !!iframe.contentDocument;
    } catch {
      accessible = false;
    }
    if (!accessible) blocked.push(iframe);
  });
  return blocked;
}

/**
 * Phase 5.9 — excludes non-interactive/invisible fields: display:none,
 * hidden attribute, type=hidden, disabled, or hidden ancestors.
 *
 * Note: `getComputedStyle(el).display` reflects only the element's own
 * value, so a field inside a `display:none` container must be detected by
 * walking the ancestor chain (this matters in real browsers too).
 */
export function isInteractive(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.getAttribute("type") === "hidden") return false;
  if ((el as HTMLInputElement).disabled) return false;

  let node: Element | null = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const style = window.getComputedStyle(node as HTMLElement);
    if (style.display === "none" || style.visibility === "hidden") return false;
    node = node.parentElement;
  }
  return true;
}
