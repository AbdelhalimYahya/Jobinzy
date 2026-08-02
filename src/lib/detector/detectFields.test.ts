import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { installChromeMock } from "../../test/chromeMock";
import type { AISettings } from "../types";

installChromeMock();

// Mock the AI classifier module so we can simulate AI classifications.
const classifyByAiMock = vi.fn();
vi.mock("./classifyAi", () => ({
  classifyByAi: (...args: unknown[]) => classifyByAiMock(...args),
}));

// detectFields imports getAISettings from storage — it runs against the mock.
import { detectFields } from "./index";
import { collectCandidates, findBlockedIframes } from "./scan";

const settings: AISettings = {
  provider: "nvidia-free",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "nvkey",
  model: "meta/llama-3.1-8b-instruct",
};

function renderForm(): void {
  document.body.innerHTML = `
    <form>
      <label for="name">Full Name</label>
      <input id="name" name="name" />

      <label for="email">Email Address</label>
      <input id="email" name="email" type="email" />

      <label for="phone">Phone Number</label>
      <input id="phone" name="phone" />

      <label for="id">National ID</label>
      <input id="id" name="national_id" />

      <label for="why">Why do you want this role?</label>
      <textarea id="why" name="why"></textarea>

      <label for="cv">Attach your CV</label>
      <input id="cv" name="cv" />

      <input type="file" id="file" name="file" />

      <input id="hidden" type="hidden" name="honeypot" />
      <input id="disabled" disabled name="disabled" />
      <div style="display:none"><input id="invisible" name="invisible" /></div>
    </form>
  `;
}

describe("detectFields (5.6-5.9)", () => {
  beforeEach(() => {
    classifyByAiMock.mockReset();
    renderForm();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns one entry per visible interactive field with valid kinds (5.6)", async () => {
    const fields = await detectFields(document, settings);
    expect(fields.length).toBe(7); // name, email, phone, id, why, cv, file
    const kinds = fields.map((f) => f.kind);
    expect(kinds).toContain("profile");
    expect(kinds).toContain("open-ended");
    expect(kinds).toContain("file-or-link");
  });

  it("resolves profile fields with confidence high and no AI call (5.3/5.8)", async () => {
    const fields = await detectFields(document, settings);
    const profileFields = fields.filter((f) => f.kind === "profile");
    expect(profileFields.map((f) => f.matchedProfileKey)).toEqual(
      expect.arrayContaining(["fullName", "email", "phone", "nationalId"])
    );
    for (const f of profileFields) {
      expect(f.confidence).toBe("high");
    }
    // The ONLY AI call that may fire is for the open-ended "why" field —
    // rule-resolved profile fields must never trigger a request (5.3).
    const aiContexts = classifyByAiMock.mock.calls.map((c) => c[0] as { id?: string });
    const aiIds = aiContexts.map((c) => c.id);
    expect(aiIds).toEqual(["why"]);
  });

  it("uses the AI fallback for open-ended questions and flags confidence ai (5.4/5.8)", async () => {
    classifyByAiMock.mockResolvedValue({ kind: "open-ended", questionText: "Why do you want this role?" });
    const fields = await detectFields(document, settings);
    const openEnded = fields.find((f) => f.kind === "open-ended");
    expect(openEnded).toBeDefined();
    expect(openEnded!.confidence).toBe("ai");
    expect(classifyByAiMock).toHaveBeenCalled();
  });

  it("skips hidden/disabled/display-none fields (5.9)", async () => {
    const fields = await detectFields(document, settings);
    const ids = fields.map((f) => f.elementRef.id);
    expect(ids).not.toContain("hidden");
    expect(ids).not.toContain("disabled");
    expect(ids).not.toContain("invisible");
  });

  it("de-duplicates identical elementRefs (5.7)", async () => {
    const fields = await detectFields(document, settings);
    const refs = fields.map((f) => f.elementRef);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("never throws when the AI call fails (resilience)", async () => {
    classifyByAiMock.mockRejectedValue(new Error("boom"));
    const fields = await detectFields(document, settings);
    // the open-ended field degrades gracefully instead of aborting
    expect(fields.some((f) => f.kind === "open-ended")).toBe(true);
  });

  it("10.2: recurses into same-origin iframes when scanning", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.body.innerHTML = `
        <label for="fname">First Name</label>
        <input id="fname" name="fname" />
      `;
    }
    const candidates = collectCandidates(document);
    expect(candidates.some((el) => el.id === "fname")).toBe(true);
    // ... and detectFields classifies it (rule-based, no AI call).
    const fields = await detectFields(document, settings);
    expect(fields.some((f) => f.elementRef.id === "fname" && f.kind === "profile")).toBe(
      true
    );
    iframe.remove();
  });

  it("10.2: cross-origin iframes are reported, not silently skipped", async () => {
    const iframe = document.createElement("iframe");
    // Simulate a cross-origin frame: contentDocument access throws.
    Object.defineProperty(iframe, "contentDocument", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    document.body.appendChild(iframe);

    // Scanning must not throw when it hits the blocked frame…
    expect(() => collectCandidates(document)).not.toThrow();
    // …and findBlockedIframes must report it so the panel can tell the user.
    const blocked = findBlockedIframes(document);
    expect(blocked).toContain(iframe);
    iframe.remove();
  });
});
