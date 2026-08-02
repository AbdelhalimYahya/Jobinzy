import { describe, it, expect } from "vitest";
import { resolveByKey, resolveProfileField } from "./detector/resolveAnswers";
import { findBankMatch } from "./answerBank";
import type { AnswerBankEntry, DetectedField, Profile } from "./types";

const profile: Profile = {
  fullName: "Ahmed Hassan",
  email: "ahmed@example.com",
  phone: "+201001234567",
  nationalId: "29901010123456",
  address: "Cairo, Egypt",
  links: [
    { label: "LinkedIn", url: "https://linkedin.com/in/ahmed" },
    { label: "GitHub", url: "https://github.com/ahmed" },
    { label: "Portfolio", url: "https://ahmed.dev" },
  ],
  cvText: "software engineer",
  structuredCv: { education: [], experience: [], skills: [] },
  onboardingQA: [],
  defaultStyle: "professional",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function fieldWith(key: DetectedField["matchedProfileKey"]): DetectedField {
  return {
    elementRef: document.createElement("input"),
    kind: "profile",
    matchedProfileKey: key,
    confidence: "high",
  };
}

describe("resolveProfileField (6.1)", () => {
  it("resolves each profile key with zero network calls", () => {
    expect(resolveProfileField(fieldWith("fullName"), profile)).toBe("Ahmed Hassan");
    expect(resolveProfileField(fieldWith("email"), profile)).toBe("ahmed@example.com");
    expect(resolveProfileField(fieldWith("phone"), profile)).toBe("+201001234567");
    expect(resolveProfileField(fieldWith("nationalId"), profile)).toBe("29901010123456");
    expect(resolveProfileField(fieldWith("address"), profile)).toBe("Cairo, Egypt");
  });

  it("splits first/last name from fullName", () => {
    expect(resolveByKey("firstName", profile)).toBe("Ahmed");
    expect(resolveByKey("lastName", profile)).toBe("Hassan");
  });

  it("returns the matching link URL", () => {
    expect(resolveByKey("linkedin", profile)).toBe("https://linkedin.com/in/ahmed");
    expect(resolveByKey("github", profile)).toBe("https://github.com/ahmed");
    expect(resolveByKey("portfolio", profile)).toBe("https://ahmed.dev");
  });

  it("returns empty for missing data", () => {
    const noAddr = { ...profile, address: undefined, links: [] };
    expect(resolveByKey("address", noAddr)).toBe("");
    expect(resolveByKey("linkedin", noAddr)).toBe("");
  });
});

describe("findBankMatch (6.2)", () => {
  const now = new Date().toISOString();
  const bank: AnswerBankEntry[] = [
    {
      questionText: "Why do you want this role?",
      answer: "Because…",
      lastUsedAt: now,
      updatedAt: now,
    },
    {
      questionText: "لماذا تريد هذه الوظيفة؟",
      answer: "لأن…",
      lastUsedAt: now,
      updatedAt: now,
    },
  ];

  it("matches identical questions despite punctuation/case", () => {
    expect(findBankMatch("Why do you want this role?", bank)?.answer).toBe("Because…");
    expect(findBankMatch("why do you want this role", bank)?.answer).toBe("Because…");
  });

  it("matches Arabic questions with/without ؟", () => {
    expect(findBankMatch("لماذا تريد هذه الوظيفة", bank)?.answer).toBe("لأن…");
  });

  it("returns null when no match", () => {
    expect(findBankMatch("What are your hobbies?", bank)).toBeNull();
  });
});
