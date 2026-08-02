/**
 * Answer generation engine (Phase 6.3–6.7).
 *
 * - 6.3 `generateOpenEndedAnswer` — builds a prompt from the question, a
 *   trimmed/summarized CV, defaultStyle, and optional job context.
 * - 6.4 persists new answers to the bank.
 * - 6.5 `regenerateWithInstruction` — same, plus a per-field instruction.
 * - 6.6 enforces output length caps by field type (single-line input vs
 *   textarea).
 * - 6.7 failures are left to the caller (panel) to handle per-field — this
 *   module never aborts a batch.
 *
 * Prompt budget: CV content is capped so long CVs never silently overflow
 * the model context window (plan 6.3).
 */
import { generate, trimPrompt } from "./aiClient";
import { findBankMatch } from "./answerBank";
import { getAnswerBank, upsertAnswerBankEntry } from "./storage";
import type { AISettings, DetectedField, Profile } from "./types";

/** Per-field answer length caps (plan 6.6). */
export const SINGLE_LINE_MAX_CHARS = 200;
export const TEXTAREA_MAX_CHARS = 4000;
/** Max CV characters fed into a prompt (plan 6.3 prompt budget). */
export const CV_CONTEXT_MAX_CHARS = 4000;

export interface AnswerContext {
  jobContext?: string;
}

/**
 * Phase 6.3 — generates a new answer via AI when no bank match exists.
 * The prompt includes: question text, summarized CV, defaultStyle, and
 * jobContext (best-effort visible page text near the form, optional).
 */
export interface ResolvedAnswer {
  answer: string;
  fromBank: boolean;
}

/**
 * Phase 6.2/7.6 — checks the answer bank BEFORE generating. Returns the
 * stored answer on a match (bumping lastUsedAt per 7.6) with zero AI calls;
 * otherwise generates a fresh answer via generateOpenEndedAnswer.
 * The panel calls this for every open-ended field.
 */
export async function resolveAnswer(
  field: DetectedField,
  profile: Profile,
  aiSettings: AISettings,
  context: AnswerContext = {}
): Promise<ResolvedAnswer> {
  const bank = await getAnswerBank();
  const match = findBankMatch(field.questionText ?? "", bank);
  if (match) {
    // 7.6 — bump lastUsedAt on every serve, keeping the rest of the entry.
    await upsertAnswerBankEntry({ ...match, lastUsedAt: new Date().toISOString() });
    return { answer: match.answer, fromBank: true };
  }
  const answer = await generateOpenEndedAnswer(field, profile, aiSettings, context);
  return { answer, fromBank: false };
}

export async function generateOpenEndedAnswer(
  field: DetectedField,
  profile: Profile,
  aiSettings: AISettings,
  context: AnswerContext = {}
): Promise<string> {
  const prompt = buildPrompt(field, profile, context);
  const raw = await generate(prompt, aiSettings, { maxTokens: 600 });
  const answer = enforceLengthCaps(field, raw);
  // 6.4 — persist to the answer bank.
  await upsertAnswerBankEntry({
    questionText: field.questionText ?? "Untitled question",
    answer,
    sourceUrl: typeof location !== "undefined" ? location.href : undefined,
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return answer;
}

/**
 * Phase 6.5 — regenerates an answer with a per-field rewrite instruction,
 * merged into the prompt and persisted back with customInstruction set.
 */
export async function regenerateWithInstruction(
  field: DetectedField,
  instruction: string,
  profile: Profile,
  aiSettings: AISettings
): Promise<string> {
  const prompt = buildPrompt(field, profile, {}, instruction);
  const raw = await generate(prompt, aiSettings, { maxTokens: 600 });
  const answer = enforceLengthCaps(field, raw);
  // Preserve the original sourceUrl (page first seen on) rather than
  // clobbering it with the current page on every rewrite.
  const bank = await getAnswerBank();
  const existing = findBankMatch(field.questionText ?? "", bank);
  await upsertAnswerBankEntry({
    questionText: field.questionText ?? "Untitled question",
    answer,
    customInstruction: instruction.trim() || undefined,
    sourceUrl:
      existing?.sourceUrl ??
      (typeof location !== "undefined" ? location.href : undefined),
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return answer;
}

function buildPrompt(
  field: DetectedField,
  profile: Profile,
  context: AnswerContext,
  instruction?: string
): string {
  const question = field.questionText ?? "Answer the question";
  const lines: string[] = [
    "You are helping a job seeker draft an answer for a job application form.",
    "",
    `Question: ${question}`,
    "",
    `Answer style: ${profile.defaultStyle || "professional, concise, one paragraph"}`,
  ];

  if (context.jobContext?.trim()) {
    lines.push("", `Job context (from the application page): ${context.jobContext.trim()}`);
  }

  const cv = summarizeCv(profile);
  if (cv) lines.push("", "Candidate background (from their CV):", cv);

  if (profile.onboardingQA.length > 0) {
    const qa = profile.onboardingQA
      .filter((q) => q.answer.trim())
      .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
      .join("\n\n");
    if (qa) lines.push("", "Candidate's own answers to recurring questions:", qa);
  }

  if (instruction?.trim()) {
    lines.push("", `Additional instruction for this specific answer: ${instruction.trim()}`);
  }

  lines.push(
    "",
    "Write only the answer. Do not repeat the question. Do not include quotes or preamble."
  );

  return trimPrompt(lines.join("\n"));
}

/** Summarizes the CV for the prompt: skills + experience + raw text (capped). */
function summarizeCv(profile: Profile): string {
  const parts: string[] = [];
  const skills = profile.structuredCv.skills?.filter(Boolean) ?? [];
  const experience = profile.structuredCv.experience?.filter(Boolean) ?? [];
  if (skills.length) parts.push(`Skills: ${skills.join(", ")}`);
  if (experience.length) parts.push(`Experience: ${experience.join(" | ")}`);
  const rawCv = profile.cvText?.trim() ?? "";
  if (rawCv) parts.push(rawCv.slice(0, CV_CONTEXT_MAX_CHARS));
  return parts.join("\n").trim();
}

/** Phase 6.6 — caps output length by field type. */
export function enforceLengthCaps(field: DetectedField, answer: string): string {
  const isSingleLine = field.elementRef instanceof HTMLInputElement;
  if (isSingleLine) {
    const oneLine = answer.replace(/\s+/g, " ").trim();
    return oneLine.length > SINGLE_LINE_MAX_CHARS
      ? oneLine.slice(0, SINGLE_LINE_MAX_CHARS)
      : oneLine;
  }
  return answer.length > TEXTAREA_MAX_CHARS ? answer.slice(0, TEXTAREA_MAX_CHARS) : answer;
}
