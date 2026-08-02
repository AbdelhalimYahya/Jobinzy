/**
 * Typed storage layer — the ONLY module that talks to `chrome.storage.local`.
 *
 * Error-handling pattern (documented for every caller):
 * - `getProfile`, `getAnswerBank`, `getAISettings` return `null`/empty for
 *   missing data, never throw.
 * - `setProfile`, `setAISettings`, `setMeta`, `upsertAnswerBankEntry`,
 *   `deleteAnswerBankEntry`, `runMigrations` THROW on invalid input or
 *   storage failure. Callers should treat any rejection as fatal for that
 *   write operation (and surface it in the UI where appropriate).
 *
 * No other module in the codebase may call `chrome.storage.local.*` directly.
 */
import { normalizeQuestion } from "./answerBank";
import type {
  AISettings,
  AnswerBankEntry,
  ExtensionMeta,
  Profile,
} from "./types";

/** Bump whenever the shape of Profile/AnswerBankEntry/AISettings changes. */
export const CURRENT_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  PROFILE: "jobinzy.profile",
  ANSWER_BANK: "jobinzy.answerBank",
  AI_SETTINGS: "jobinzy.aiSettings",
  META: "jobinzy.meta",
} as const;

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "nvidia-free",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "",
  model: "meta/llama-3.1-8b-instruct",
};

const DEFAULT_META: ExtensionMeta = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  onboardingComplete: false,
};

async function read(key: string): Promise<unknown> {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function write(
  key: string,
  value: unknown
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function remove(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

// ---- Profile --------------------------------------------------------------

export async function getProfile(): Promise<Profile | null> {
  const value = await read(STORAGE_KEYS.PROFILE);
  if (!value || typeof value !== "object") return null;
  return value as Profile;
}

/**
 * Validates and persists the profile. Rejects with a ValidationError if any
 * required field is empty/missing — never writes partial/garbage data.
 */
export async function setProfile(profile: Profile): Promise<void> {
  validateProfile(profile);
  await write(STORAGE_KEYS.PROFILE, { ...profile, updatedAt: new Date().toISOString() });
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateProfile(profile: Profile): void {
  const missing: string[] = [];
  if (!profile.fullName || !profile.fullName.trim()) missing.push("fullName");
  if (!profile.email || !profile.email.trim()) missing.push("email");
  if (!profile.phone || !profile.phone.trim()) missing.push("phone");
  if (missing.length > 0) {
    throw new ValidationError(
      `Profile is missing required fields: ${missing.join(", ")}`
    );
  }
}

// ---- Answer bank ----------------------------------------------------------

export async function getAnswerBank(): Promise<AnswerBankEntry[]> {
  const value = await read(STORAGE_KEYS.ANSWER_BANK);
  if (!Array.isArray(value)) return [];
  return value as AnswerBankEntry[];
}

/**
 * Upserts an answer-bank entry keyed on `questionText` (overwrites any
 * existing entry with the same key). Updates `updatedAt` on every write.
 */
export async function upsertAnswerBankEntry(entry: AnswerBankEntry): Promise<void> {
  if (!entry.questionText || !entry.questionText.trim()) {
    throw new ValidationError("Answer bank entry requires a questionText");
  }
  if (!entry.answer || !entry.answer.trim()) {
    throw new ValidationError("Answer bank entry requires an answer");
  }
  const bank = await getAnswerBank();
  const now = new Date().toISOString();
  const normalizedKey = normalizeQuestion(entry.questionText);
  const next = bank.filter((e) => normalizeQuestion(e.questionText) !== normalizedKey);
  // Store the original text (trimmed) for readable display in the panel and
  // management view; ALL comparisons/keying normalize both sides, so the
  // effective lookup key is the normalized text (plan data model §5).
  next.push({ ...entry, questionText: entry.questionText.trim(), updatedAt: now });
  await write(STORAGE_KEYS.ANSWER_BANK, next);
}

export async function deleteAnswerBankEntry(questionText: string): Promise<void> {
  const bank = await getAnswerBank();
  const normalizedKey = normalizeQuestion(questionText);
  const next = bank.filter((e) => normalizeQuestion(e.questionText) !== normalizedKey);
  await write(STORAGE_KEYS.ANSWER_BANK, next);
}

// ---- AI settings ----------------------------------------------------------

export async function getAISettings(): Promise<AISettings | null> {
  const value = await read(STORAGE_KEYS.AI_SETTINGS);
  if (!value || typeof value !== "object") return null;
  const settings = value as AISettings;
  // Backfill any missing default fields so partial legacy data still works.
  return { ...DEFAULT_AI_SETTINGS, ...settings };
}

export async function setAISettings(settings: AISettings): Promise<void> {
  if (!settings.baseUrl || !settings.baseUrl.trim()) {
    throw new ValidationError("AI settings require a base URL");
  }
  if (!settings.model || !settings.model.trim()) {
    throw new ValidationError("AI settings require a model");
  }
  await write(STORAGE_KEYS.AI_SETTINGS, { ...settings, baseUrl: settings.baseUrl.trim() });
}

// ---- Extension metadata ---------------------------------------------------

export async function getMeta(): Promise<ExtensionMeta> {
  const value = await read(STORAGE_KEYS.META);
  if (!value || typeof value !== "object") return { ...DEFAULT_META };
  return { ...DEFAULT_META, ...(value as Partial<ExtensionMeta>) };
}

export async function setMeta(meta: Partial<ExtensionMeta>): Promise<void> {
  const current = await getMeta();
  await write(STORAGE_KEYS.META, { ...current, ...meta });
}

// ---- Schema migrations ----------------------------------------------------

/**
 * Called from the background service worker on `onInstalled`/`onStartup`.
 * Compares the stored schemaVersion to CURRENT_SCHEMA_VERSION and migrates
 * forward. Safe to call repeatedly (idempotent).
 */
export async function runMigrations(): Promise<void> {
  const meta = await getMeta();
  if (meta.schemaVersion === CURRENT_SCHEMA_VERSION) return;

  // Future migrations: switch on meta.schemaVersion and step forward.
  // e.g. if (meta.schemaVersion < 2) { /* migrate 1 -> 2 */ }
  // For v1 there is nothing to migrate; just stamp the current version.
  await write(STORAGE_KEYS.META, {
    ...meta,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

// ---- Destructive (Phase 12.5) ----------------------------------------------

/**
 * Wipes Profile, AnswerBank and AISettings. Keeps ExtensionMeta but resets
 * onboardingComplete to false. Phase 12.5 wires the options-page control.
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    remove(STORAGE_KEYS.PROFILE),
    remove(STORAGE_KEYS.ANSWER_BANK),
    remove(STORAGE_KEYS.AI_SETTINGS),
  ]);
  const meta = await getMeta();
  await write(STORAGE_KEYS.META, {
    ...meta,
    onboardingComplete: false,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}
