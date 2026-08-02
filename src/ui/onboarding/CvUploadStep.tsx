import { useRef, useState } from "react";
import { extractTextFromPdf, structureCv } from "../../lib/cvParser";
import { debugWarn } from "../../lib/debug";
import { getAISettings } from "../../lib/storage";
import type { Profile } from "../../lib/types";

interface Props {
  onDone: (result: {
    cvText: string;
    cvFileName?: string;
    structuredCv: { education: string[]; experience: string[]; skills: string[] };
  }) => void;
  onSkip: () => void;
}

/**
 * Steps 2.2–2.4 — PDF CV upload, client-side text extraction (pdf.js),
 * then AI-structured CV data (falling back to empty arrays gracefully).
 */
export function CvUploadStep({ onDone, onSkip }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Please choose a PDF file (.pdf).");
      return;
    }
    setStatus("working");
    setFileName(file.name);
    try {
      const cvText = await extractTextFromPdf(file);
      let structuredCv: Profile["structuredCv"] = {
        education: [],
        experience: [],
        skills: [],
      };
      try {
        const settings = await getAISettings();
        if (settings?.apiKey) {
          structuredCv = await structureCv(cvText, settings);
        }
      } catch {
        // AI structuring is best-effort; onboarding continues regardless.
      }
      setStatus("done");
      onDone({ cvText, cvFileName: file.name, structuredCv });
    } catch (err) {
      setError(
        "Couldn't read that PDF. It may be image-only or corrupt — you can skip this step and add your CV text manually later."
      );
      debugWarn("[Jobinzy] PDF extraction failed:", err);
      setStatus("idle");
    }
  }

  return (
    <div className="jf-form">
      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-cv">
          Upload your CV (PDF)
        </label>
        <p className="jf-hint">
          Extracted text is used as context for AI-generated answers. It stays
          on your device in chrome.storage.local.
        </p>
        <input
          id="onb-cv"
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="jf-file"
          onChange={(e) => void handleFile(e.target.files?.[0])}
          disabled={status === "working"}
        />
        {error && <p className="jf-error">{error}</p>}
        {status === "working" && (
          <p className="jf-status">
            <span className="jf-spinner" aria-hidden="true" /> Extracting text…
          </p>
        )}
        {status === "done" && fileName && (
          <p className="jf-status jf-status-ok">✓ Read {fileName}.</p>
        )}
      </div>

      <div className="jf-actions">
        <button
          type="button"
          className="jf-btn jf-btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={status === "working"}
        >
          Choose PDF
        </button>
        <button type="button" className="jf-btn jf-btn-ghost" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
