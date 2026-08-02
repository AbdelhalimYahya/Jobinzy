/**
 * Review panel — SEED (Phase 4.3).
 *
 * The full panel (per-field controls, file/link section, fill action,
 * drag/collapse, keyboard a11y, loading states, summary) is built in
 * Phase 8. This seed renders the detected field list so the Phase 4
 * acceptance ("clicking Detect Form opens a populated panel") is testable.
 */
// CSS is injected into the shadow root by the content script (index.tsx)
// via `panel.css?inline` — plain imports in content-script chunks produce
// unreferenced assets, so we do not import it here.
import type { DetectedField } from "../../lib/types";

interface PanelProps {
  fields: DetectedField[];
  onClose: () => void;
}

export function Panel({ fields, onClose }: PanelProps) {
  return (
    <section className="jbz-panel" role="dialog" aria-label="Jobinzy review panel">
      <header className="jbz-panel-header">
        <h2 className="jbz-panel-title">Jobinzy</h2>
        <button
          type="button"
          className="jbz-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </button>
      </header>

      <p className="jbz-panel-sub">
        {fields.length} field{fields.length === 1 ? "" : "s"} detected on this
        page.
      </p>

      <ul className="jbz-field-list">
        {fields.map((field, i) => (
          <li className="jbz-field-row" key={i}>
            <span className="jbz-field-q">
              {field.questionText || "Unlabeled field"}
            </span>
            <span className={`jbz-badge jbz-badge-${field.kind}`}>{field.kind}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
