/**
 * Phase 5.4 — AI fallback classifier.
 *
 * Called only for fields where classifyByRules returns null. Sends ONLY the
 * extracted FieldContext fields (never the full page HTML) and asks the
 * model to return one of the four `DetectedField.kind` values. Never throws:
 * on any failure it returns `{ kind: "unknown" }` so detection never breaks.
 */
import { generate } from "../aiClient";
import { debugWarn } from "../debug";
import { extractJson } from "../json";
import type { AiClassification, AISettings, FieldContext } from "../types";

const EMPTY_RESULT: AiClassification = { kind: "unknown" };

export async function classifyByAi(
  context: FieldContext,
  aiSettings: AISettings
): Promise<AiClassification> {
  const prompt = [
    "You classify HTML form fields for a job-application autofill tool.",
    "Here is the extracted context of ONE form field (label, placeholder, name, nearby text, etc.).",
    "",
    JSON.stringify(context, null, 2),
    "",
    'Respond with ONLY valid JSON in exactly this shape: {"kind": "profile" | "open-ended" | "file-or-link" | "unknown", "matchedProfileKey": "fullName|firstName|lastName|email|phone|nationalId|address|linkedin|portfolio|github|drive|otherLink" (omit if not profile), "questionText": "the question/label text as a human would read it" (omit if not open-ended)}',
    "Do not include any other text or markdown.",
  ].join("\n");

  try {
    const raw = await generate(prompt, aiSettings, { maxTokens: 120, temperature: 0 });
    const parsed: unknown = JSON.parse(extractJson(raw));
    const obj = parsed as Partial<AiClassification>;
    const kind = obj.kind;
    if (kind !== "profile" && kind !== "open-ended" && kind !== "file-or-link" && kind !== "unknown") {
      return EMPTY_RESULT;
    }
    return {
      kind,
      matchedProfileKey: obj.matchedProfileKey,
      questionText: obj.questionText,
    };
  } catch (err) {
    debugWarn("[Jobinzy] AI classification failed, marking unknown:", err);
    return EMPTY_RESULT;
  }
}
