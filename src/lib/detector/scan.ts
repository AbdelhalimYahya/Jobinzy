/**
 * Phase 5.1 — DOM candidate scanner.
 *
 * Walks the DOM via querySelectorAll plus manual recursion into any OPEN
 * shadow roots it encounters, collecting `input`, `textarea`, `select`, and
 * elements with role="textbox" or role="combobox".
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
