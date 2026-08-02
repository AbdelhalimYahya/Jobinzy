/**
 * Field detector — full engine (Phase 5).
 *
 * detectFields() runs the pipeline in order:
 *   5.1 scan candidates (with open shadow-root recursion)
 *   5.2 extract context per candidate
 *   5.3 rule-based classification (EN+AR) → confidence "high"
 *   5.4 AI fallback classification → confidence "ai"
 *   5.5 file/link field flagging (excluded from auto-answer flow)
 *   5.7 de-duplicate by elementRef
 *   5.9 skip non-interactive/hidden fields
 *
 * Resilience: a failure in one field's AI call never breaks the rest
 * (classifyByAi never throws).
 */
import { getAISettings } from "../storage";
import type { AISettings, DetectedField, FieldContext } from "../types";
import { collectCandidates, isInteractive } from "./scan";
import { extractContext } from "./context";
import { classifyByRules, looksOpenEnded } from "./classifyRules";
import { classifyByAi } from "./classifyAi";
import { fileLinkNote, isFileOrLinkField } from "./classifyFileLink";

/**
 * Detects form fields on a page. `aiSettings` may be supplied directly (for
 * tests); otherwise loaded from storage. Never throws — AI failures degrade
 * gracefully to `kind: "unknown"`.
 */
export async function detectFields(
  root: Document | ShadowRoot = document,
  aiSettings?: AISettings | null
): Promise<DetectedField[]> {
  let settings = aiSettings;
  if (settings === undefined) {
    settings = await getAISettings();
  }

  const candidates = collectCandidates(root);
  const seen = new Set<HTMLElement>();
  const result: DetectedField[] = [];

  for (const el of candidates) {
    // 5.7 de-duplicate by elementRef
    if (seen.has(el)) continue;
    // 5.9 skip non-interactive fields
    if (!isInteractive(el)) continue;

    seen.add(el);
    const context: FieldContext = extractContext(el);

    // 5.5a — unambiguous file inputs are always file-or-link.
    if (el instanceof HTMLInputElement && el.type === "file") {
      result.push({
        elementRef: el,
        kind: "file-or-link",
        note: fileLinkNote(el, context),
        questionText: context.labelText ?? context.placeholder ?? context.nearbyText,
        confidence: "high",
      });
      continue;
    }

    // 5.3 rules first — profile link fields (LinkedIn/GitHub/portfolio/Drive)
    // win over the generic file/link text heuristic (5.5b), so a field like
    // "رابط لينكد إن" resolves to profile/linkedin, not file-or-link.
    const profileKey = classifyByRules(context);
    if (profileKey) {
      result.push({
        elementRef: el,
        kind: "profile",
        matchedProfileKey: profileKey,
        questionText: context.labelText ?? context.placeholder ?? context.nearbyText,
        confidence: "high",
      });
      continue;
    }

    // 5.5b — remaining file/link text heuristics (attach, upload, cv, …).
    if (isFileOrLinkField(el, context)) {
      result.push({
        elementRef: el,
        kind: "file-or-link",
        note: fileLinkNote(el, context),
        questionText: context.labelText ?? context.placeholder ?? context.nearbyText,
        confidence: "high",
      });
      continue;
    }

    // Open-ended heuristic gate: only spend an AI call where it's plausible.
    const openEnded = looksOpenEnded(context) || el.tagName === "TEXTAREA";

    // 5.4 AI fallback — wrapped in try/catch so a throwing classifier can
    // never break the rest of detection (plan resilience requirement).
    if (openEnded && settings?.apiKey) {
      try {
        const ai = await classifyByAi(context, settings);
        result.push({
          elementRef: el,
          kind: ai.kind === "unknown" ? "open-ended" : ai.kind,
          matchedProfileKey: ai.matchedProfileKey,
          questionText:
            ai.questionText ??
            context.labelText ??
            context.placeholder ??
            context.nearbyText,
          confidence: "ai",
        });
      } catch {
        // Degrade gracefully: treat as open-ended, no confidence in AI.
        result.push({
          elementRef: el,
          kind: "open-ended",
          questionText: context.labelText ?? context.placeholder ?? context.nearbyText,
          confidence: "high",
        });
      }
      continue;
    }

    result.push({
      elementRef: el,
      kind: openEnded ? "open-ended" : "unknown",
      questionText: context.labelText ?? context.placeholder ?? context.nearbyText,
      confidence: "high",
    });
  }

  return result;
}
