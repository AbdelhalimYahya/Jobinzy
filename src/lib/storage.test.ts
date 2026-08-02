import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetChromeStore } from "../test/chromeMock";
import {
  CURRENT_SCHEMA_VERSION,
  ValidationError,
  clearAllData,
  deleteAnswerBankEntry,
  getAISettings,
  getAnswerBank,
  getMeta,
  getProfile,
  runMigrations,
  setAISettings,
  setMeta,
  setProfile,
  upsertAnswerBankEntry,
} from "./storage";
import type { AnswerBankEntry, Profile } from "./types";

installChromeMock();

function sampleProfile(): Profile {
  return {
    fullName: "Ahmed Hassan",
    email: "ahmed@example.com",
    phone: "+201001234567",
    nationalId: "29901010123456",
    address: "Cairo, Egypt",
    links: [
      { label: "LinkedIn", url: "https://linkedin.com/in/ahmed" },
      { label: "GitHub", url: "https://github.com/ahmed" },
    ],
    cvText: "software engineer with 5 years of experience",
    cvFileName: "cv.pdf",
    structuredCv: { education: ["Cairo Uni"], experience: ["SWE @ Acme"], skills: ["TS"] },
    onboardingQA: [{ question: "Career summary?", answer: "5 years full-stack" }],
    defaultStyle: "professional, one paragraph",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("storage round-trips (1.1)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("getProfile returns null when nothing stored", async () => {
    expect(await getProfile()).toBeNull();
  });

  it("setProfile then getProfile round-trips all values", async () => {
    const p = sampleProfile();
    await setProfile(p);
    const got = await getProfile();
    expect(got).not.toBeNull();
    expect(got!.fullName).toBe("Ahmed Hassan");
    expect(got!.email).toBe("ahmed@example.com");
    expect(got!.phone).toBe("+201001234567");
    expect(got!.nationalId).toBe("29901010123456");
    expect(got!.links).toHaveLength(2);
    expect(got!.structuredCv.skills).toEqual(["TS"]);
  });

  it("upsertAnswerBankEntry overwrites the same questionText (7.1)", async () => {
    const entry: AnswerBankEntry = {
      questionText: "Why do you want this role?",
      answer: "first",
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertAnswerBankEntry(entry);
    await upsertAnswerBankEntry({ ...entry, answer: "second" });
    const bank = await getAnswerBank();
    expect(bank).toHaveLength(1);
    expect(bank[0].answer).toBe("second");
  });

  it("upsert keys on normalized question text (7.2 agreement)", async () => {
    const now = new Date().toISOString();
    await upsertAnswerBankEntry({
      questionText: "Why do you want this role?",
      answer: "first",
      lastUsedAt: now,
      updatedAt: now,
    });
    await upsertAnswerBankEntry({
      questionText: "why do you want this role",
      answer: "second",
      lastUsedAt: now,
      updatedAt: now,
    });
    const bank = await getAnswerBank();
    expect(bank).toHaveLength(1);
    expect(bank[0].answer).toBe("second");
  });

  it("deleteAnswerBankEntry removes only the matching entry", async () => {
    const now = new Date().toISOString();
    await upsertAnswerBankEntry({
      questionText: "A?",
      answer: "a",
      lastUsedAt: now,
      updatedAt: now,
    });
    await upsertAnswerBankEntry({
      questionText: "B?",
      answer: "b",
      lastUsedAt: now,
      updatedAt: now,
    });
    await deleteAnswerBankEntry("A?");
    const bank = await getAnswerBank();
    expect(bank).toHaveLength(1);
    expect(bank[0].questionText).toBe("B?");
  });

  it("setAISettings then getAISettings round-trips", async () => {
    await setAISettings({
      provider: "byo",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    const got = await getAISettings();
    expect(got?.provider).toBe("byo");
    expect(got?.model).toBe("gpt-4o-mini");
  });

  it("getAISettings returns null before any write", async () => {
    expect(await getAISettings()).toBeNull();
  });

  it("setMeta merges partial updates", async () => {
    await setMeta({ onboardingComplete: true });
    const meta = await getMeta();
    expect(meta.onboardingComplete).toBe(true);
    expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe("schema versioning and migrations (1.2)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("fresh install ends with schemaVersion 1", async () => {
    await runMigrations();
    const meta = await getMeta();
    expect(meta.schemaVersion).toBe(1);
  });

  it("runMigrations is idempotent", async () => {
    await runMigrations();
    const first = await getMeta();
    await runMigrations();
    const second = await getMeta();
    expect(second).toEqual(first);
  });
});

describe("write-time validation guards (1.4)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("setProfile rejects when required fields are missing", async () => {
    const bad = { ...sampleProfile(), fullName: "" };
    await expect(setProfile(bad)).rejects.toBeInstanceOf(ValidationError);
    // nothing was written
    expect(await getProfile()).toBeNull();
  });

  it("setProfile rejects when email or phone missing", async () => {
    const bad = { ...sampleProfile(), email: "   " };
    await expect(setProfile(bad)).rejects.toBeInstanceOf(ValidationError);
  });

  it("upsertAnswerBankEntry rejects empty answer", async () => {
    const now = new Date().toISOString();
    await expect(
      upsertAnswerBankEntry({
        questionText: "Q?",
        answer: "",
        lastUsedAt: now,
        updatedAt: now,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("clearAllData (12.5 forward)", () => {
  beforeEach(() => {
    resetChromeStore();
  });

  it("wipes profile/bank/settings and resets onboardingComplete", async () => {
    await setProfile(sampleProfile());
    await setAISettings({
      provider: "nvidia-free",
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
    });
    await setMeta({ onboardingComplete: true });
    await clearAllData();
    expect(await getProfile()).toBeNull();
    expect(await getAnswerBank()).toEqual([]);
    expect(await getAISettings()).toBeNull();
    const meta = await getMeta();
    expect(meta.onboardingComplete).toBe(false);
  });
});
