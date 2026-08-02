import { describe, it, expect, vi, beforeEach } from "vitest";
import { installChromeMock, resetChromeStore } from "../test/chromeMock";

installChromeMock();

const generateMock = vi.fn();
vi.mock("./aiClient", () => ({
  generate: (...args: unknown[]) => generateMock(...args),
  trimPrompt: (p: string) => p,
}));

import {
  enforceLengthCaps,
  generateOpenEndedAnswer,
  regenerateWithInstruction,
  resolveAnswer,
} from "./answerGen";
import { getAnswerBank } from "./storage";
import type { AISettings, DetectedField, Profile } from "./types";

const settings: AISettings = {
  provider: "byo",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
};

const profile: Profile = {
  fullName: "Ahmed Hassan",
  email: "ahmed@example.com",
  phone: "+201001234567",
  nationalId: "29901010123456",
  links: [],
  cvText: "5 years of React and TypeScript experience at Acme Corp",
  structuredCv: {
    education: ["Cairo University"],
    experience: ["Senior Frontend Engineer at Acme Corp"],
    skills: ["React", "TypeScript"],
  },
  onboardingQA: [{ question: "Career summary?", answer: "Full-stack engineer" }],
  defaultStyle: "professional, one paragraph, confident",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function textareaField(): DetectedField {
  const el = document.createElement("textarea");
  return { elementRef: el, kind: "open-ended", questionText: "Why do you want this role?", confidence: "ai" };
}

function inputField(): DetectedField {
  const el = document.createElement("input");
  return { elementRef: el, kind: "open-ended", questionText: "Current company?", confidence: "ai" };
}

describe("generateOpenEndedAnswer (6.3/6.4)", () => {
  beforeEach(() => {
    resetChromeStore();
    generateMock.mockReset();
  });

  it("includes CV context and defaultStyle in the prompt", async () => {
    generateMock.mockResolvedValue("I am passionate about React and TypeScript.");
    await generateOpenEndedAnswer(textareaField(), profile, settings, {
      jobContext: "Acme Corp is hiring a senior frontend engineer.",
    });
    const prompt = generateMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Why do you want this role?");
    expect(prompt).toContain("React");
    expect(prompt).toContain("Acme Corp"); // CV-specific detail
    expect(prompt).toContain("professional, one paragraph, confident");
    expect(prompt).toContain("Acme Corp is hiring");
  });

  it("persists the generated answer to the bank (6.4)", async () => {
    generateMock.mockResolvedValue("I bring 5 years of React experience.");
    await generateOpenEndedAnswer(textareaField(), profile, settings);
    const bank = await getAnswerBank();
    expect(bank).toHaveLength(1);
    expect(bank[0].answer).toBe("I bring 5 years of React experience.");
  });

  it("caps single-line input answers (6.6)", async () => {
    generateMock.mockResolvedValue("word ".repeat(300).trim());
    const answer = await generateOpenEndedAnswer(inputField(), profile, settings);
    expect(answer.includes("\n")).toBe(false);
    expect(answer.length).toBeLessThanOrEqual(200);
  });

  it("lets AI failures propagate to the caller (6.7 — per-field handling)", async () => {
    generateMock.mockRejectedValue(new Error("network down"));
    await expect(generateOpenEndedAnswer(textareaField(), profile, settings)).rejects.toThrow();
  });
});

describe("regenerateWithInstruction (6.5)", () => {
  beforeEach(() => {
    resetChromeStore();
    generateMock.mockReset();
  });

  it("merges the instruction into the prompt and saves customInstruction", async () => {
    generateMock.mockResolvedValue("short answer");
    const field = textareaField();
    await regenerateWithInstruction(field, "make this much shorter", profile, settings);
    const prompt = generateMock.mock.calls[0][0] as string;
    expect(prompt).toContain("make this much shorter");
    const bank = await getAnswerBank();
    expect(bank[0].customInstruction).toBe("make this much shorter");
  });
});

describe("resolveAnswer (6.2 — bank first, no AI on repeat)", () => {
  beforeEach(() => {
    resetChromeStore();
    generateMock.mockReset();
  });

  it("serves a stored answer on the second occurrence with zero AI calls", async () => {
    // First occurrence: generate + persist.
    generateMock.mockResolvedValue("I bring 5 years of React experience.");
    const first = await resolveAnswer(textareaField(), profile, settings);
    expect(first.fromBank).toBe(false);
    expect(generateMock).toHaveBeenCalledTimes(1);

    // Second occurrence: same normalized question → bank hit, no AI.
    generateMock.mockReset();
    const second = await resolveAnswer(textareaField(), profile, settings);
    expect(second.fromBank).toBe(true);
    expect(second.answer).toBe("I bring 5 years of React experience.");
    expect(generateMock).not.toHaveBeenCalled();
  });
});

describe("enforceLengthCaps (6.6)", () => {
  it("flattens and caps single-line inputs", () => {
    const result = enforceLengthCaps(inputField(), "a\nb ".repeat(150));
    expect(result.includes("\n")).toBe(false);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("caps textareas at the longer limit", () => {
    const result = enforceLengthCaps(textareaField(), "x".repeat(5000));
    expect(result.length).toBeLessThanOrEqual(4000);
  });
});
