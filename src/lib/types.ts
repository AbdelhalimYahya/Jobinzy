/**
 * Shared data model for Jobinzy.
 *
 * Matches plan.md Section 5 exactly. Any new field added to the model must
 * be added here AND in plan.md together (per AGENT.md §3), and must bump
 * `ExtensionMeta.schemaVersion` with a migration in `lib/storage.ts`.
 */

/** A link label + URL pair, e.g. portfolio / LinkedIn / GitHub / Drive. */
export interface ProfileLink {
  label: string;
  url: string;
}

/** Single user profile — one per browser install in v1. */
export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  address?: string;
  links: ProfileLink[];
  /** Extracted text from uploaded CV, used as AI context. */
  cvText: string;
  /** Just the filename, for the "attach this file" helper text. */
  cvFileName?: string;
  /** Parsed from CV during onboarding. */
  structuredCv: {
    education: string[];
    experience: string[];
    skills: string[];
  };
  /** Extra onboarding Q&A pairs. */
  onboardingQA: { question: string; answer: string }[];
  /** Free-text tone/format instruction, e.g. "professional, one paragraph". */
  defaultStyle: string;
  createdAt: string;
  updatedAt: string;
}

/** A saved answer for a recurring question (answer bank). */
export interface AnswerBankEntry {
  /** Normalized question text, used as lookup key. */
  questionText: string;
  answer: string;
  /** User-provided rewrite instruction, if any. */
  customInstruction?: string;
  /** Page the question was first seen on, for reference. */
  sourceUrl?: string;
  lastUsedAt: string;
  updatedAt: string;
}

/** AI provider configuration. */
export interface AISettings {
  provider: "nvidia-free" | "byo";
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Extension-level metadata. */
export interface ExtensionMeta {
  schemaVersion: number;
  onboardingComplete: boolean;
}

/**
 * Which profile field a detected form field maps to.
 * Includes first/last name splits and link-type keys (Phase 5.3).
 */
export type ProfileFieldKey =
  | "fullName"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "nationalId"
  | "address"
  | "linkedin"
  | "portfolio"
  | "github"
  | "drive"
  | "otherLink";

/** Classification of a detected field (Phase 5.6). */
export type DetectedFieldKind = "profile" | "open-ended" | "file-or-link" | "unknown";

/**
 * A single detected form field, produced by the detector (Phase 5) and
 * consumed by the panel (Phase 8) and fill engine (Phase 9).
 */
export interface DetectedField {
  elementRef: HTMLElement;
  kind: DetectedFieldKind;
  matchedProfileKey?: ProfileFieldKey;
  questionText?: string;
  note?: string;
  confidence: "high" | "ai";
}

/** Extracted label/context info for a candidate field (Phase 5.2). */
export interface FieldContext {
  labelText?: string;
  ariaLabel?: string;
  placeholder?: string;
  nearbyText?: string;
  name?: string;
  id?: string;
}

/** Result of an AI classification call (Phase 5.4). */
export interface AiClassification {
  kind: DetectedFieldKind;
  matchedProfileKey?: ProfileFieldKey;
  questionText?: string;
}
