import { useCallback, useEffect, useState } from "react";
import type { AnswerBankEntry } from "../../lib/types";
import {
  deleteAnswerBankEntry,
  getAnswerBank,
  upsertAnswerBankEntry,
} from "../../lib/storage";

interface Props {
  onBack?: () => void;
}

/**
 * Answer-bank management view (task 7.5).
 * Lists all saved entries (question truncated, answer preview, last used
 * date), sorted by lastUsedAt descending, with per-row edit and delete.
 * Deleting an entry means the next detection of that question generates a
 * fresh answer instead of matching the bank.
 */
export function AnswerBankView({ onBack }: Props) {
  const [entries, setEntries] = useState<AnswerBankEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editAnswer, setEditAnswer] = useState("");

  const refresh = useCallback(async () => {
    const bank = await getAnswerBank();
    setEntries([...bank].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  async function handleDelete(questionText: string) {
    await deleteAnswerBankEntry(questionText);
    await refresh();
  }

  function startEdit(entry: AnswerBankEntry) {
    setEditingQuestion(entry.questionText);
    setEditAnswer(entry.answer);
  }

  function editId(entry: AnswerBankEntry, index: number): string {
    // Question text may contain spaces/punctuation — use the row index so
    // the id stays valid HTML for the label-for association.
    return `jf-bank-edit-${index}`;
  }

  async function saveEdit(questionText: string) {
    const original = entries.find((e) => e.questionText === questionText);
    if (!original) return;
    await upsertAnswerBankEntry({ ...original, answer: editAnswer.trim() });
    setEditingQuestion(null);
    setEditAnswer("");
    await refresh();
  }

  if (!loaded) return <div className="jf-center">Loading…</div>;

  return (
    <div className="jf-form">
      {entries.length === 0 ? (
        <p className="jf-hint">
          No saved answers yet. Answers you generate for open-ended questions
          are stored here so you never retype them twice.
        </p>
      ) : (
        <ul className="jf-bank-list">
          {entries.map((entry, index) => (
            <li className="jf-bank-item" key={entry.questionText}>
              {editingQuestion === entry.questionText ? (
                <div className="jf-field">
                  <label
                    className="jf-label"
                    htmlFor={editId(entry, index)}
                  >
                    {entry.questionText}
                  </label>
                  <textarea
                    id={editId(entry, index)}
                    className="jf-textarea"
                    rows={3}
                    value={editAnswer}
                    onChange={(e) => setEditAnswer(e.target.value)}
                  />
                  <div className="jf-actions">
                    <button
                      type="button"
                      className="jf-btn jf-btn-primary jf-btn-sm"
                      onClick={() => void saveEdit(entry.questionText)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="jf-btn jf-btn-ghost jf-btn-sm"
                      onClick={() => setEditingQuestion(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="jf-bank-text">
                    <p className="jf-bank-question">{entry.questionText}</p>
                    <p className="jf-bank-preview">{entry.answer}</p>
                    <p className="jf-hint">
                      Last used {fmtDate(entry.lastUsedAt)}
                      {entry.sourceUrl ? " · first seen on this page" : ""}
                    </p>
                  </div>
                  <div className="jf-bank-actions">
                    <button
                      type="button"
                      className="jf-btn jf-btn-ghost jf-btn-sm"
                      onClick={() => startEdit(entry)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="jf-btn jf-btn-danger jf-btn-sm"
                      onClick={() => void handleDelete(entry.questionText)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {onBack && (
        <div className="jf-actions">
          <button type="button" className="jf-btn jf-btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
