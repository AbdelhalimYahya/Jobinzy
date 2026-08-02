/**
 * Shared JSON helpers.
 *
 * `extractJson` tolerates markdown fences (```json) and stray prose around
 * a JSON object — used wherever we parse LLM output (cvParser.structureCv,
 * detector classifyAi).
 */

export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}
