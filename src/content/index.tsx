/**
 * Jobinzy content script — injected ONLY from the toolbar click (4.1).
 *
 * 4.2: creates a shadow-DOM host with a fixed-position "Detect Form" button
 *      (isolated from the host page's CSS).
 * 4.3: clicking the button runs detection and opens the review panel.
 * 4.4: de-duplicates — if the host already exists, re-show it instead of
 *      creating a second instance. Close removes it entirely.
 * 4.6: RTL-safe — the panel uses fixed positioning and avoids LTR-only
 *      assumptions (see panel.css).
 *
 * Note on structure: the panel (Phase 8) and detector (Phase 5) are seeded
 * here as minimal versions so Phase 4 acceptance criteria are testable;
 * they are fully implemented in their own phases.
 *
 * CSS note: content-script chunks get their CSS extracted to an unreferenced
 * asset by Vite, so panel styles are imported `?inline` and injected into
 * the shadow root manually — this is what makes them actually apply in the
 * built extension.
 */
import { createRoot, type Root } from "react-dom/client";
import { detectFields } from "../lib/detector";
import type { DetectedField } from "../lib/types";
import { Panel } from "./panel/Panel";
import panelCss from "./panel/panel.css?inline";
import triggerCss from "./trigger.css?inline";

export const ROOT_ID = "jobinzy-root";

let panelRoot: Root | null = null;

/**
 * Returns the existing host or creates one. Calling this twice on the same
 * page yields exactly one instance (4.4).
 */
export function ensureHost(): HTMLElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    existing.style.display = "block";
    return existing;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.all = "initial"; // prevent host-page styles from leaking in
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `${triggerCss}\n${panelCss}`;
  shadow.appendChild(style);

  const button = document.createElement("button");
  button.className = "jbz-trigger";
  button.type = "button";
  button.textContent = "Detect Form";
  button.addEventListener("click", () => {
    void runDetection();
  });
  shadow.appendChild(button);

  document.body.appendChild(host);
  return host;
}

/** Removes the injected UI from the DOM entirely (4.4 close control). */
export function removeHost(): void {
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }
  const host = document.getElementById(ROOT_ID);
  if (host) host.remove();
}

/** Runs detection and mounts the review panel (4.3). */
export async function runDetection(): Promise<DetectedField[]> {
  const fields = await detectFields(document);
  mountPanel(fields);
  return fields;
}

function mountPanel(fields: DetectedField[]): void {
  const host = ensureHost();
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return;

  // Mount the panel into the same shadow root as the trigger button.
  let container = shadowRoot.getElementById("jbz-panel-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "jbz-panel-root";
    shadowRoot.appendChild(container);
  }
  if (panelRoot) panelRoot.unmount();
  panelRoot = createRoot(container);
  panelRoot.render(<Panel fields={fields} onClose={removeHost} />);
}
