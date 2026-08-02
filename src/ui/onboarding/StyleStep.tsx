import { useState } from "react";

interface Props {
  initial?: string;
  onDone: (style: string) => void;
  onBack?: () => void;
}

const EXAMPLES = [
  "professional, one paragraph, confident tone",
  "warm and conversational, bullet points where it makes sense",
];

/**
 * Step 2.5 — free-text "how should AI answers sound?" field with greyed
 * example hints (not pre-filled values).
 */
export function StyleStep({ initial, onDone, onBack }: Props) {
  const [style, setStyle] = useState(initial ?? "");
  const [touched, setTouched] = useState(false);

  return (
    <div className="jf-form">
      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-style">
          How should AI-generated answers sound?
        </label>
        <textarea
          id="onb-style"
          className="jf-textarea"
          rows={4}
          value={style}
          placeholder={EXAMPLES[0] + "\n" + EXAMPLES[1]}
          onChange={(e) => setStyle(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && !style.trim() && (
          <p className="jf-hint">
            You can leave this blank — answers will use a professional default.
          </p>
        )}
      </div>

      <div className="jf-actions">
        {onBack && (
          <button type="button" className="jf-btn jf-btn-ghost" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" className="jf-btn jf-btn-primary" onClick={() => onDone(style.trim())}>
          Continue
        </button>
      </div>
    </div>
  );
}
