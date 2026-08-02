/**
 * Client-side CV parsing. `extractTextFromPdf` runs pdf.js fully in-browser
 * (the file never leaves the device). `structureCv` sends ONLY the extracted
 * text to the user-configured AI provider and parses a strict JSON response.
 */
import * as pdfjsLib from "pdfjs-dist";
import { generate, trimPrompt } from "./aiClient";
import { extractJson } from "./json";
import type { AISettings, Profile } from "./types";

// pdf.js needs a worker; Vite's `new URL(..., import.meta.url)` emits the
// worker as a static asset so it resolves correctly in the built extension.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** Extracts all text from a PDF file, client-side. */
export async function extractTextFromPdf(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

const EMPTY_STRUCTURED: Profile["structuredCv"] = {
  education: [],
  experience: [],
  skills: [],
};

/**
 * Asks the configured AI to structure CV text into education/experience/
 * skills arrays (returned as strict JSON). On any failure (bad response,
 * parse error, network), returns empty arrays and logs a warning — it never
 * throws, so onboarding can always continue.
 */
export async function structureCv(
  cvText: string,
  aiSettings: AISettings
): Promise<Profile["structuredCv"]> {
  const prompt = trimPrompt(
    [
      "You are a CV parser. Extract structured information from the CV text below.",
      'Respond with ONLY valid JSON in exactly this shape (no markdown, no commentary):',
      '{"education": string[], "experience": string[], "skills": string[]}',
      "Keep each item short (one phrase). If a section has no entries, use an empty array.",
      "",
      "CV TEXT:",
      cvText,
    ].join("\n")
  );

  try {
    const raw = await generate(prompt, aiSettings, { maxTokens: 500, temperature: 0.2 });
    const jsonText = extractJson(raw);
    const parsed: unknown = JSON.parse(jsonText);
    const obj = parsed as Record<string, unknown>;
    return {
      education: toStringArray(obj.education),
      experience: toStringArray(obj.experience),
      skills: toStringArray(obj.skills),
    };
  } catch (err) {
    console.warn("[Jobinzy] structureCv failed, falling back to empty arrays:", err);
    return EMPTY_STRUCTURED;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}
