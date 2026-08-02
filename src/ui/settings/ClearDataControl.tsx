/**
 * 12.5 — "Clear all my data" destructive control.
 *
 * Wipes Profile, AnswerBank and AISettings and resets onboardingComplete to
 * false (keeps schemaVersion) via lib/storage's clearAllData(). Two-step
 * confirmation per plan 12.5 ("with a confirmation step before it executes"),
 * and a failure surfaces as an inline error rather than claiming success.
 */
import { useState } from "react";
import { clearAllData } from "../../lib/storage";

interface ClearDataControlProps {
  /** Called after a successful wipe so the options page can show onboarding. */
  onCleared: () => void;
}

export function ClearDataControl({ onCleared }: ClearDataControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await clearAllData();
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="jf-danger-zone" aria-label="Clear all my data">
      <h2 className="jf-danger-title">Clear all my data</h2>
      <p className="jf-hint">
        Deletes your profile, saved answers and AI settings from this device.
        This cannot be undone.
      </p>

      {!confirming ? (
        <button
          type="button"
          className="jf-btn jf-btn-danger"
          onClick={() => setConfirming(true)}
        >
          Clear all my data
        </button>
      ) : (
        <div className="jf-actions">
          <button
            type="button"
            className="jf-btn jf-btn-danger"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? "Clearing…" : "Yes, delete everything"}
          </button>
          <button
            type="button"
            className="jf-btn jf-btn-ghost"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="jf-error">{error}</p>}
    </section>
  );
}
