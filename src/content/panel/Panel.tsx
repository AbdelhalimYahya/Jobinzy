/**
 * Review panel — full Phase 8 implementation.
 *
 * - 8.1 field list: one row per DetectedField with question text, current
 *   answer, a status chip and the confidence indicator from 5.8.
 * - 8.2 per-field controls: Accept (default), Skip, "I'll do this myself",
 *   inline Edit, Rewrite (open-ended only), Retry on error.
 * - 8.3 file/link helper section with guidance text and a "Show me" action
 *     (scroll + highlight), plus an optional inline link paste for text
 *     fields (plan §1 item 5 — never auto-attaches files).
 * - 8.4 "Fill form" action → fill engine (Phase 9 core) + post-fill
 *     verification (9.6) with a mismatch warning.
 * - 8.5 post-fill: panel stays open, editing a row re-fills just that field,
 *     Close removes the whole injected UI (via onClose = removeHost).
 * - 8.6 draggable via the header (pointer events) + collapse toggle.
 * - 8.7 keyboard: native tab order, :focus-visible styles, Escape closes.
 * - 8.8 per-field loading state while AI generation is in flight — other
 *     rows stay fully usable.
 *
 * 7.3/7.4: bank-served answers show a "reused" badge + Rewrite flow.
 * 6.7: a failing field shows an inline error + Retry, never aborts the rest.
 *
 * CSS is injected into the shadow root by the content script (index.tsx) via
 * `panel.css?inline` — plain imports in content-script chunks produce
 * unreferenced assets, so this file does not import the stylesheet.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AISettings, DetectedField, Profile } from "../../lib/types";
import { getAISettings, getProfile } from "../../lib/storage";
import { resolveProfileField } from "../../lib/detector/resolveAnswers";
import { regenerateWithInstruction, resolveAnswer } from "../../lib/answerGen";
import {
  fillField,
  fillFields,
  flashHighlight,
  scrollIntoViewIfNeeded,
  type FillEntry,
} from "../../lib/fillEngine";

type SkipMode = "accept" | "skip" | "manual";
type RowStatus =
  | "auto-filled"
  | "ai-generated"
  | "from-bank"
  | "needs-input"
  | "error"
  | "mismatch";

interface RowState {
  field: DetectedField;
  answer: string;
  status: RowStatus;
  skipMode: SkipMode;
  loading: boolean;
  error?: string;
  editMode: boolean;
  rewriteMode: boolean;
  draft: string;
}

interface PanelProps {
  fields: DetectedField[];
  onClose: () => void;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  "auto-filled": "Auto-filled",
  "ai-generated": "AI-generated",
  "from-bank": "From answer bank",
  "needs-input": "Needs your input",
  error: "Error",
  mismatch: "Check manually",
};

const SKIP_LABELS: Record<SkipMode, string> = {
  accept: "Accept",
  skip: "Skip",
  manual: "I'll do this myself",
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function initRow(field: DetectedField): RowState {
  return {
    field,
    answer: "",
    status: "needs-input",
    skipMode: "accept",
    loading: false,
    editMode: false,
    rewriteMode: false,
    draft: "",
  };
}

export function Panel({ fields, onClose }: PanelProps) {
  // file-or-link fields live in a separate helper section (8.3), never in
  // the auto-answer/fill list.
  const mainFields = useMemo(
    () => fields.filter((f) => f.kind !== "file-or-link"),
    [fields]
  );
  const fileRows = useMemo(
    () => fields.filter((f) => f.kind === "file-or-link"),
    [fields]
  );

  const [rows, setRows] = useState<RowState[]>(() => mainFields.map(initRow));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [hasFilled, setHasFilled] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  // Set on unmount so async resolutions (resolveRow/confirmRewrite/saveEdit)
  // that land after Close never call setState on an unmounted panel (React 18
  // update-on-unmounted warning).
  const disposedRef = useRef(false);

  const updateRow = useCallback((index: number, patch: Partial<RowState>) => {
    if (disposedRef.current) return;
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  // Load profile + AI settings once (content scripts have chrome.storage).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [p, s] = await Promise.all([getProfile(), getAISettings()]);
      if (cancelled) return;
      setProfile(p);
      setAiSettings(s);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Resolves one row: profile fields straight from storage (6.1, no AI),
   * open-ended via bank-first resolveAnswer (6.2), unknown → needs input.
   * Never throws — failures become a per-field error + retry (6.7).
   */
  const resolveRow = useCallback(
    async (index: number) => {
      const field = rows[index]?.field;
      if (!field) return;
      if (field.kind === "profile") {
        const value = profile ? resolveProfileField(field, profile) : "";
        updateRow(index, {
          answer: value,
          status: value ? "auto-filled" : "needs-input",
          loading: false,
        });
        return;
      }
      if (field.kind !== "open-ended") {
        updateRow(index, { status: "needs-input", loading: false, error: field.note });
        return;
      }
      if (!aiSettings?.apiKey || !profile) {
        updateRow(index, {
          status: "needs-input",
          loading: false,
          error: "No AI provider configured — add an API key in Settings, or fill this manually.",
        });
        return;
      }
      updateRow(index, { loading: true, error: undefined });
      try {
        const { answer, fromBank } = await resolveAnswer(field, profile, aiSettings);
        updateRow(index, {
          answer,
          status: fromBank ? "from-bank" : "ai-generated",
          loading: false,
        });
      } catch (err) {
        updateRow(index, { status: "error", loading: false, error: messageOf(err) });
      }
    },
    [rows, profile, aiSettings, updateRow]
  );

  // Resolve every row once the profile/settings load completes.
  useEffect(() => {
    if (!loaded) return;
    mainFields.forEach((_, i) => {
      void resolveRow(i);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Mark disposed on unmount (guards async setState after Close).
  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  // 8.7 — Escape closes the panel (keyboard accessibility).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ---- per-row actions ------------------------------------------------------

  function setSkipMode(index: number, mode: SkipMode): void {
    updateRow(index, { skipMode: mode });
  }

  function startEdit(index: number): void {
    updateRow(index, { editMode: true, rewriteMode: false, draft: rows[index].answer });
  }

  function cancelEdit(index: number): void {
    updateRow(index, { editMode: false, draft: "" });
  }

  /** 8.2/8.5 — commits a manual edit; re-fills this field if already filled. */
  function saveEdit(index: number): void {
    const value = rows[index].draft;
    updateRow(index, { answer: value, editMode: false, draft: "", status: "needs-input" });
    if (hasFilled && value.trim() && rows[index].skipMode === "accept") {
      const result = fillField(rows[index].field, value);
      // Surface a failed re-fill (e.g. an unsupported widget) to the user
      // instead of silently no-oping (8.5).
      if (!result.ok) {
        updateRow(index, { status: "error", error: result.message });
      }
    }
  }

  function startRewrite(index: number): void {
    updateRow(index, { rewriteMode: true, editMode: false, draft: "" });
  }

  /** 7.4/8.2 — rewrite with a per-field instruction via AI (6.5). */
  async function confirmRewrite(index: number): Promise<void> {
    const instruction = rows[index].draft.trim();
    const row = rows[index];
    if (!instruction || !profile || !aiSettings) return;
    // Keep rewriteMode true while loading so the row shows "Rewriting…".
    updateRow(index, { loading: true, draft: "", error: undefined });
    try {
      const answer = await regenerateWithInstruction(
        row.field,
        instruction,
        profile,
        aiSettings
      );
      updateRow(index, { answer, status: "ai-generated", loading: false, rewriteMode: false });
    } catch (err) {
      updateRow(index, {
        status: "error",
        loading: false,
        rewriteMode: false,
        error: messageOf(err),
      });
    }
  }

  // ---- fill actions ---------------------------------------------------------

  /**
   * 8.4/9.5/9.6 — fills every accepted row via the batch engine. Skip state
   * and post-fill verification are centralized in fillFields: the entry's
   * skip flag (9.5) ensures skipped rows are never touched, and values the
   * page resets are flagged as a mismatch (9.6) instead of shown as success.
   */
  async function handleFill(): Promise<void> {
    const entries: FillEntry[] = [];
    rows.forEach((row) => {
      if (row.loading || !row.answer.trim()) return;
      entries.push({
        field: row.field,
        value: row.answer,
        // 9.5 — the engine skips; skipMode is the single source of truth.
        skip: row.skipMode !== "accept",
      });
    });
    if (entries.length === 0) return;
    setHasFilled(true);

    const results = await fillFields(entries);
    results.forEach((res) => {
      const i = rows.findIndex((r) => r.field.elementRef === res.field.elementRef);
      if (i < 0) return;
      if (!res.ok) {
        updateRow(i, { status: "error", error: res.message });
        return;
      }
      const stuck = !!res.mismatch;
      updateRow(i, {
        status: stuck ? "mismatch" : rows[i].status,
        error: stuck
          ? "The page didn't keep this value — please check it manually."
          : undefined,
      });
    });
  }

  // ---- drag (8.6) ------------------------------------------------------------

  type DragEvent = ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>;

  function onDragStart(e: DragEvent): void {
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    try {
      // Pointer capture makes the drag keep working if the cursor leaves the
      // header; guarded for environments without pointer capture (jsdom).
      e.currentTarget.setPointerCapture?.((e as ReactPointerEvent<HTMLElement>).pointerId);
    } catch {
      /* pointer capture unsupported (jsdom) — drag still works via move */
    }
  }

  function onDragMove(e: DragEvent): void {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      left: Math.max(0, e.clientX - drag.dx),
      top: Math.max(0, e.clientY - drag.dy),
    });
  }

  function onDragEnd(): void {
    dragRef.current = null;
  }

  const totalCount = fields.length;

  return (
    <section
      ref={panelRef}
      className={`jbz-panel${collapsed ? " jbz-collapsed" : ""}`}
      role="dialog"
      aria-label="Jobinzy review panel"
      style={
        position
          ? { left: position.left, top: position.top, insetInlineEnd: "auto" }
          : undefined
      }
    >
      <header
        className="jbz-panel-header"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
      >
        <div className="jbz-header-title">
          <h2 className="jbz-panel-title">Jobinzy</h2>
          <p className="jbz-panel-sub">
            {totalCount} field{totalCount === 1 ? "" : "s"} detected on this page.
          </p>
        </div>
        <div className="jbz-header-actions">
          <button
            type="button"
            className="jbz-close"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand panel" : "Collapse panel"}
            aria-expanded={!collapsed}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <button
            type="button"
            className="jbz-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="jbz-panel-body">
          <ul className="jbz-field-list">
            {rows.map((row, i) => (
              <li className="jbz-field-row" key={i}>
                <div className="jbz-field-top">
                  <span className="jbz-field-q">
                    {row.field.questionText || "Unlabeled field"}
                  </span>
                  <span className={`jbz-badge jbz-badge-${row.status}`}>
                    {STATUS_LABEL[row.status]}
                    {row.status === "from-bank" && (
                      <span className="jbz-reused"> · reused</span>
                    )}
                  </span>
                  <span
                    className={`jbz-confidence${
                      row.field.confidence === "ai" ? " jbz-confidence-ai" : ""
                    }`}
                    title={
                      row.field.confidence === "ai"
                        ? "Classified/generated with AI"
                        : "High-confidence match"
                    }
                  >
                    {row.field.confidence === "ai" ? "AI" : "high"}
                  </span>
                </div>

                {row.loading ? (
                  <div className="jbz-row-loading" role="status">
                    <span className="jbz-spinner" aria-hidden="true" />
                    {row.rewriteMode ? "Rewriting…" : "Generating…"}
                  </div>
                ) : row.status === "error" ? (
                  <div className="jbz-error">
                    <span>{row.error}</span>
                    <button
                      type="button"
                      className="jbz-btn jbz-btn-small"
                      onClick={() => void resolveRow(i)}
                    >
                      Retry
                    </button>
                  </div>
                ) : row.editMode ? (
                  <div className="jbz-edit-box">
                    <textarea
                      className="jbz-edit-textarea"
                      value={row.draft}
                      onChange={(e) => updateRow(i, { draft: e.target.value })}
                      rows={3}
                      aria-label={`Edit answer for ${row.field.questionText ?? "field"}`}
                    />
                    <div className="jbz-edit-actions">
                      <button
                        type="button"
                        className="jbz-btn jbz-btn-primary"
                        onClick={() => saveEdit(i)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="jbz-btn"
                        onClick={() => cancelEdit(i)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : row.rewriteMode ? (
                  <div className="jbz-edit-box">
                    <textarea
                      className="jbz-edit-textarea"
                      value={row.draft}
                      onChange={(e) => updateRow(i, { draft: e.target.value })}
                      rows={2}
                      placeholder="e.g. make this much shorter, or more formal…"
                      aria-label={`Rewrite instruction for ${row.field.questionText ?? "field"}`}
                    />
                    <div className="jbz-edit-actions">
                      <button
                        type="button"
                        className="jbz-btn jbz-btn-primary"
                        onClick={() => void confirmRewrite(i)}
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        className="jbz-btn"
                        onClick={() => updateRow(i, { rewriteMode: false, draft: "" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="jbz-field-answer">
                    {row.answer ? (
                      <span className={row.status === "mismatch" ? "jbz-mismatch" : ""}>
                        {row.answer}
                      </span>
                    ) : (
                      <span className="jbz-field-empty">— needs your input —</span>
                    )}
                    {row.status === "mismatch" && (
                      <span className="jbz-error-inline">{row.error}</span>
                    )}
                  </div>
                )}

                <div className="jbz-row-controls">
                  <div className="jbz-disposition" role="group" aria-label="Field disposition">
                    {(Object.keys(SKIP_LABELS) as SkipMode[]).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={`jbz-btn jbz-btn-small${
                          row.skipMode === mode ? " jbz-btn-active" : ""
                        }`}
                        aria-pressed={row.skipMode === mode}
                        onClick={() => setSkipMode(i, mode)}
                      >
                        {SKIP_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                  <div className="jbz-row-actions">
                    <button
                      type="button"
                      className="jbz-btn jbz-btn-small"
                      onClick={() => startEdit(i)}
                    >
                      Edit
                    </button>
                    {row.field.kind === "open-ended" && (
                      <button
                        type="button"
                        className="jbz-btn jbz-btn-small"
                        onClick={() => startRewrite(i)}
                      >
                        Rewrite
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {fileRows.length > 0 && (
            <section className="jbz-file-section" aria-label="File and link fields">
              <h3 className="jbz-file-heading">File &amp; link fields</h3>
              {fileRows.map((row, i) => (
                <FileRow row={row} key={i} />
              ))}
            </section>
          )}

          <footer className="jbz-footer">
            <button
              type="button"
              className="jbz-btn jbz-btn-primary jbz-fill-btn"
              onClick={handleFill}
            >
              Fill form
            </button>
            <span className="jbz-footer-hint">
              Review each field before filling — Jobinzy never submits anything.
            </span>
          </footer>
        </div>
      )}
    </section>
  );
}

/**
 * 8.3 — one helper entry per file-or-link field: guidance text, a "Show me"
 * action (scroll + highlight the real element), and — for TEXT fields only —
 * an inline "paste a link" control (plan §1 item 5). File inputs are never
 * auto-attached, just pointed at.
 */
function FileRow({ row }: { row: DetectedField }) {
  const [draft, setDraft] = useState("");
  const [used, setUsed] = useState(false);
  const isFileInput =
    row.elementRef instanceof HTMLInputElement && row.elementRef.type === "file";

  function showMe(): void {
    scrollIntoViewIfNeeded(row.elementRef);
    flashHighlight(row.elementRef);
  }

  function useLink(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!draft.trim()) return;
    const result = fillField(row, draft.trim());
    if (result.ok) {
      setUsed(true);
      setDraft("");
    }
  }

  return (
    <div className="jbz-file-row">
      <div className="jbz-file-top">
        <span className="jbz-field-q">
          {row.questionText || row.note || "File or link field"}
        </span>
        <button type="button" className="jbz-btn jbz-btn-small" onClick={showMe}>
          Show me
        </button>
      </div>
      <p className="jbz-file-note">
        {isFileInput
          ? row.note ||
            "This form wants a file (e.g. CV). Jobinzy never auto-attaches files — attach it manually."
          : row.note ||
            "This form wants a file or a link. Attach it manually, or paste a link below:"}
      </p>
      {!isFileInput && (
        <form className="jbz-file-link-form" onSubmit={useLink}>
          <input
            className="jbz-file-link-input"
            type="url"
            placeholder="Paste a link…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setUsed(false);
            }}
            aria-label="Paste a link for this field"
          />
          <button type="submit" className="jbz-btn jbz-btn-small">
            Use
          </button>
        </form>
      )}
      {used && <span className="jbz-file-used">Link pasted into the field ✓</span>}
    </div>
  );
}
