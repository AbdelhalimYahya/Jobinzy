/**
 * Phase 5.5 — file/link-upload field detection.
 *
 * Flags `input[type="file"]` directly, plus any text field whose nearby
 * text (EN or AR) asks for an attachment/upload/link. These are marked
 * `kind: "file-or-link"` and excluded from the auto-answer flow entirely.
 */
import type { FieldContext } from "../types";

const FILE_LINK_KEYWORDS = [
  "attach",
  "upload",
  "resume",
  "cv",
  "curriculum vitae",
  "video",
  "portfolio link",
  "link to your",
  "cover letter",
  "أرفق",
  "ارفق",
  "ارفع",
  "أرفع",
  "رفع",
  "السيرة الذاتية",
  "سيرتك الذاتية",
  "رابط",
];

export function isFileOrLinkField(
  el: HTMLElement,
  context: FieldContext
): boolean {
  if (el instanceof HTMLInputElement && el.type === "file") return true;

  const haystack = [
    context.labelText,
    context.ariaLabel,
    context.placeholder,
    context.nearbyText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return FILE_LINK_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
}

/** Human-readable guidance for the panel's file/link section (8.3). */
export function fileLinkNote(el: HTMLElement, context: FieldContext): string {
  if (el instanceof HTMLInputElement && el.type === "file") {
    return "This form wants a file upload (e.g. CV). Upload it manually.";
  }
  const text = [context.labelText, context.ariaLabel, context.placeholder, context.nearbyText]
    .filter(Boolean)
    .join(" ")
    .trim();
  return text
    ? `This form is asking for: “${text.slice(0, 120)}”`
    : "This form is asking for a file or link — add it manually.";
}
