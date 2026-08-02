import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installChromeMock, resetChromeStore } from "../../test/chromeMock";
import { AnswerBankView } from "./AnswerBankView";
import { resolveAnswer } from "../../lib/answerGen";
import {
  getAnswerBank,
  upsertAnswerBankEntry,
} from "../../lib/storage";
import type { AISettings } from "../../lib/types";

installChromeMock();

// Mock aiClient so resolveAnswer can never fire a real network call even if
// a bank-miss path were ever exercised (unit tests must not hit the network).
const generateMock = vi.fn();
vi.mock("../../lib/aiClient", () => ({
  generate: (...args: unknown[]) => generateMock(...args),
  trimPrompt: (p: string) => p,
}));

async function seedBank() {
  const now = Date.now();
  await upsertAnswerBankEntry({
    questionText: "Why do you want this role?",
    answer: "Older answer",
    sourceUrl: "https://example.com/jobs/1",
    lastUsedAt: new Date(now - 86400000).toISOString(), // yesterday
    updatedAt: new Date(now - 86400000).toISOString(),
  });
  await upsertAnswerBankEntry({
    questionText: "Tell us about yourself",
    answer: "Recent answer",
    lastUsedAt: new Date(now - 60000).toISOString(), // 60s ago
    updatedAt: new Date(now - 60000).toISOString(),
  });
}

describe("AnswerBankView (7.5)", () => {
  beforeEach(() => {
    resetChromeStore();
    vi.clearAllMocks();
  });

  it("lists entries sorted by lastUsedAt descending", async () => {
    await seedBank();
    render(<AnswerBankView />);
    const items = await screen.findAllByRole("listitem");
    // The most-recent entry ("Tell us about yourself") renders first.
    const firstItem = within(items[0]);
    expect(firstItem.getByText("Tell us about yourself")).toBeInTheDocument();
  });

  it("deleting an entry removes it from storage", async () => {
    await seedBank();
    render(<AnswerBankView />);
    const user = userEvent.setup();
    const items = await screen.findAllByRole("listitem");
    const second = within(items[1]); // "Why do you want this role?"
    await user.click(second.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      const bank = await getAnswerBank();
      expect(bank.some((e) => e.questionText.includes("Why do you want"))).toBe(false);
      expect(bank).toHaveLength(1);
    });
  });
});

describe("AnswerBankView edit (7.5)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("editing an answer persists the new text and preserves other fields", async () => {
    await seedBank();
    render(<AnswerBankView />);
    const user = userEvent.setup();
    const items = await screen.findAllByRole("listitem");
    // Second row = "Why do you want this role?" (older lastUsedAt).
    const second = within(items[1]);
    await user.click(second.getByRole("button", { name: "Edit" }));
    const textarea = await second.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "Edited answer");
    await user.click(second.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const bank = await getAnswerBank();
      const entry = bank.find((e) => e.questionText.includes("Why do you want"));
      expect(entry?.answer).toBe("Edited answer");
      // other fields preserved
      expect(entry?.sourceUrl).toBe("https://example.com/jobs/1");
      expect(entry?.lastUsedAt).toBeDefined();
    });
  });
});

describe("bank storage semantics (7.1/7.2)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("7.1: upsert stores the full entry shape and overwrites on same question", async () => {
    const now = new Date().toISOString();
    await upsertAnswerBankEntry({
      questionText: "Q?",
      answer: "one",
      sourceUrl: "https://x",
      lastUsedAt: now,
      updatedAt: now,
    });
    await upsertAnswerBankEntry({
      questionText: "Q?",
      answer: "two",
      lastUsedAt: now,
      updatedAt: now,
    });
    const bank = await getAnswerBank();
    expect(bank).toHaveLength(1);
    expect(bank[0].answer).toBe("two");
  });
});

describe("7.6 — serving an entry bumps lastUsedAt", () => {
  beforeEach(() => {
    resetChromeStore();
    generateMock.mockReset();
  });

  it("resolveAnswer serving an older entry bumps its lastUsedAt past the other entry", async () => {
    await seedBank(); // "Why do you want this role?" is older (yesterday)

    // Serve the older question as if it appeared on a new form — no AI,
    // the bank hit bumps lastUsedAt to now.
    const aiSettings: AISettings = {
      provider: "byo",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    };
    const profile = {
      fullName: "A",
      email: "a@b.c",
      phone: "1",
      nationalId: "1",
      links: [],
      cvText: "",
      structuredCv: { education: [], experience: [], skills: [] },
      onboardingQA: [],
      defaultStyle: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const field = {
      elementRef: document.createElement("textarea"),
      kind: "open-ended" as const,
      questionText: "Why do you want this role?",
      confidence: "ai" as const,
    };
    const result = await resolveAnswer(field, profile, aiSettings);

    // Bank-first: served from the bank, no AI call.
    expect(result.fromBank).toBe(true);
    expect(generateMock).not.toHaveBeenCalled();

    const bank = await getAnswerBank();
    const served = bank.find((e) => e.questionText.includes("Why do you want"))!;
    expect(new Date(served.lastUsedAt).getTime()).toBeGreaterThan(
      new Date(bank.find((e) => e.questionText.includes("Tell us"))!.lastUsedAt).getTime()
    );
  });
});
