import { useState } from "react";

interface Props {
  initial?: { question: string; answer: string }[];
  onDone: (qa: { question: string; answer: string }[]) => void;
  onBack?: () => void;
}

const SUGGESTED = [
  "Give a 2-3 sentence career summary",
  "Describe one achievement you're proud of",
];

/**
 * Step 2.6 — optional onboarding Q&A. Two suggested questions pre-populated
 * as empty entries; blank answers are filtered out before saving.
 */
export function QaStep({ initial, onDone, onBack }: Props) {
  const [rows, setRows] = useState(() => {
    const existing = initial?.length
      ? initial
      : SUGGESTED.map((q) => ({ question: q, answer: "" }));
    return existing.map((r) => ({ ...r }));
  });

  function update(index: number, patch: Partial<{ question: string; answer: string }>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setRows((prev) => [...prev, { question: "", answer: "" }]);
  }

  function handleDone() {
    onDone(rows.filter((r) => r.answer.trim() !== ""));
  }

  return (
    <div className="jf-form">
      <p className="jf-hint">
        Optional: answer a few recurring questions once and Jobinzy will reuse
        them. Blank answers are skipped.
      </p>
      {rows.map((row, i) => (
        <div className="jf-qa-row" key={i}>
          <input
            className="jf-input"
            aria-label={`Question ${i + 1}`}
            placeholder="Question"
            value={row.question}
            onChange={(e) => update(i, { question: e.target.value })}
          />
          <textarea
            className="jf-textarea"
            aria-label={`Answer ${i + 1}`}
            placeholder="Your answer…"
            rows={2}
            value={row.answer}
            onChange={(e) => update(i, { answer: e.target.value })}
          />
          <button
            type="button"
            className="jf-btn jf-btn-danger jf-btn-sm"
            onClick={() => remove(i)}
            aria-label={`Remove Q&A ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="jf-btn jf-btn-ghost jf-btn-sm" onClick={add}>
        + Add question
      </button>

      <div className="jf-actions">
        {onBack && (
          <button type="button" className="jf-btn jf-btn-ghost" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" className="jf-btn jf-btn-primary" onClick={handleDone}>
          Continue
        </button>
      </div>
    </div>
  );
}
