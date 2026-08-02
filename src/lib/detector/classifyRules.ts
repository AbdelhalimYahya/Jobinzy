/**
 * Phase 5.3 — rule-based classifier.
 *
 * Matches extracted context (label/placeholder/nearby/name/id) against
 * bilingual keyword maps (English + Arabic, since Wuzzuf and MENA job sites
 * commonly use Arabic labels). Case-insensitive; no AI involved.
 */
import type { FieldContext, ProfileFieldKey } from "../types";

type KeywordRow = [ProfileFieldKey, string[]];

// Ordered: more specific keys first so "first name" wins over "name".
const KEYWORD_MAP: KeywordRow[] = [
  ["firstName", ["first name", "الاسم الاول", "الاسم الأول"]],
  ["lastName", ["last name", "family name", "surname", "اسم العائلة", "الاسم الاخير", "الاسم الأخير"]],
  ["email", ["email", "e-mail", "e mail", "البريد الالكتروني", "البريد الإلكتروني", "ايميل", "بريد"]],
  ["phone", ["phone", "telephone", "mobile", "cell phone", "هاتف", "موبايل", "جوال", "رقم الهاتف", "رقم الموبايل"]],
  ["nationalId", ["national id", "national number", "id number", "identity number", "ssn", "الرقم القومي", "الرقم الوطني", "رقم قومي", "رقم الهوية", "بطاقة الرقم"]],
  ["linkedin", ["linkedin", "لينكد ان", "لينكد إن", "لينكدين", "لينكدإن"]],
  ["github", ["github", "جيت هاب"]],
  ["portfolio", ["portfolio", "بورتفوليو", "اعمالي", "أعمالي"]],
  ["drive", ["google drive", "drive link", "درايف"]],
  ["address", ["address", "عنوان", "العنوان"]],
  ["fullName", ["full name", "your name", "الاسم الكامل", "الاسم", "الاسم بالكامل"]],
  ["otherLink", ["portfolio link", "link to your", "your website", "رابط", "الموقع", "موقعك"]],
];

function haystackOf(context: FieldContext): string {
  return [context.labelText, context.ariaLabel, context.placeholder, context.nearbyText, context.name, context.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Returns the profile key a field maps to, or null if no rule matches. */
export function classifyByRules(context: FieldContext): ProfileFieldKey | null {
  const haystack = haystackOf(context);
  for (const [key, keywords] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) return key;
    }
  }
  return null;
}

/** Open-ended question heuristic — used before the AI fallback (5.4). */
export function looksOpenEnded(context: FieldContext): boolean {
  const haystack = haystackOf(context);
  const openKeywords = [
    "why",
    "tell us",
    "tell me",
    "describe",
    "explain",
    "about yourself",
    "what makes you",
    "how do you",
    "motivat",
    "strength",
    "experience",
    "why do you want",
    "لماذا",
    "حدثنا",
    "اخبرنا",
    "أخبرنا",
    "اشرح",
    "وصف",
    "عن نفسك",
  ];
  return openKeywords.some((kw) => haystack.includes(kw));
}
