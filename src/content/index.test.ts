import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { installChromeMock } from "../test/chromeMock";
import type { DetectedField } from "../lib/types";
import { ensureHost, removeHost, ROOT_ID, runDetection } from "./index";

installChromeMock();

function renderTestForm(): HTMLElement {
  document.body.innerHTML = `
    <form>
      <label for="name">Full Name</label>
      <input id="name" name="name" />
      <label for="why">Why do you want this role?</label>
      <textarea id="why" name="why"></textarea>
      <input type="file" name="cv" />
    </form>
  `;
  return document.body;
}

describe("content script (4.2-4.6)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    removeHost();
  });

  afterEach(() => {
    removeHost();
  });

  it("4.4: ensureHost creates exactly one shadow host", () => {
    const first = ensureHost();
    const second = ensureHost();
    expect(first).toBe(second);
    expect(document.getElementById(ROOT_ID)).toBe(first);
    expect(first.shadowRoot).not.toBeNull();
    // exactly one Detect Form button
    const buttons = first.shadowRoot!.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    const trigger = Array.from(buttons).find((b) => b.textContent === "Detect Form");
    expect(trigger).toBeTruthy();
  });

  it("4.2: button lives inside a shadow root", () => {
    const host = ensureHost();
    const button = host.shadowRoot!.querySelector("button");
    expect(button).not.toBeNull();
    expect(host.shadowRoot).not.toBeNull();
  });

  it("4.3: runDetection detects the form's fields and mounts the panel", async () => {
    renderTestForm();
    let fields: DetectedField[] = [];
    await act(async () => {
      fields = await runDetection();
    });
    expect(fields.length).toBe(3); // input + textarea + file (all visible)
    const host = document.getElementById(ROOT_ID)!;
    const panel = host.shadowRoot!.getElementById("jbz-panel-root");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("3 fields");
  });

  it("4.4: removeHost fully removes injected UI", () => {
    ensureHost();
    expect(document.getElementById(ROOT_ID)).not.toBeNull();
    removeHost();
    expect(document.getElementById(ROOT_ID)).toBeNull();
  });

  it("4.6: works on an RTL page", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    renderTestForm();
    const host = ensureHost();
    // Panel styles use logical properties; just confirm mount + detect work.
    let fields: DetectedField[] = [];
    await act(async () => {
      fields = await runDetection();
    });
    expect(fields.length).toBe(3);
    expect(host.shadowRoot).not.toBeNull();
    document.documentElement.removeAttribute("dir");
  });
});
