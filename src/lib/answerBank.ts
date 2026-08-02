/**
 * Answer bank helpers.
 *
 * `normalizeQuestion` is the canonical question normalizer for the answer
 * bank. Per plan 7.2 it is used BOTH by storage lookups (upsert/delete
 * keying) and by `findBankMatch` (Phase 6.2), so the two can never disagree
 * about what counts as "the same question".
 */
import type { AnswerBankEntry } from "./types";

/**
 * Normalizes question text for comparison/keying:
 * - lowercase
 * - trim
 * - collapse repeated whitespace
 * - strip trailing punctuation (`?` and `؟`)
 *
 * "Why do you want this role?" and "why do you want this role" both become
 * "why do you want this role".
 */
export function normalizeQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?؟]+$/, "")
    .trim();
}

/**
 * Phase 6.2 / 7.2 — finds a bank entry whose normalized question text
 * matches, or null if none does.
 */
export function findBankMatch(
  questionText: string,
  bank: AnswerBankEntry[]
): AnswerBankEntry | null {
  const key = normalizeQuestion(questionText);
  return bank.find((e) => normalizeQuestion(e.questionText) === key) ?? null;
}
