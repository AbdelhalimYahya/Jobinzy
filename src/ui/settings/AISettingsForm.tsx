import { useEffect, useState } from "react";
import type { AISettings } from "../../lib/types";
import { getAISettings, setAISettings } from "../../lib/storage";
import { testConnection } from "../../lib/aiClient";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
const BYO_FALLBACK_MODEL = "gpt-4o-mini";

interface Props {
  onBack?: () => void;
}

/**
 * AI settings screen (tasks 3.1–3.4, 3.6).
 * - Mode toggle: NVIDIA free tier vs BYO key. Both modes' values are kept in
 *   local state so switching modes never loses what was typed (3.1).
 * - Test connection calls aiClient.testConnection (3.4).
 * - Stored API keys are masked to the last 4 chars until "Replace key" (3.6).
 */
export function AISettingsForm({ onBack }: Props) {
  const [mode, setMode] = useState<AISettings["provider"]>("nvidia-free");
  const [loaded, setLoaded] = useState(false);

  // Both modes' fields kept separately so toggling preserves each set.
  const [freeKey, setFreeKey] = useState("");
  const [byoBaseUrl, setByoBaseUrl] = useState("");
  const [byoKey, setByoKey] = useState("");
  const [byoModel, setByoModel] = useState("");

  // Masking: track which stored keys are currently revealed for replacement.
  const [replaceFreeKey, setReplaceFreeKey] = useState(false);
  const [replaceByoKey, setReplaceByoKey] = useState(false);

  const [savedFreeKey, setSavedFreeKey] = useState("");
  const [savedByoKey, setSavedByoKey] = useState("");

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await getAISettings();
      if (settings) {
        setMode(settings.provider);
        if (settings.provider === "nvidia-free") {
          setFreeKey(settings.apiKey);
          setSavedFreeKey(settings.apiKey);
          setByoBaseUrl("");
          setByoKey("");
          setByoModel("");
        } else {
          setByoBaseUrl(settings.baseUrl);
          setByoKey(settings.apiKey);
          setByoModel(settings.model);
          setSavedByoKey(settings.apiKey);
          setFreeKey("");
        }
      }
      setLoaded(true);
    })();
  }, []);

  function currentSettings(): AISettings {
    if (mode === "nvidia-free") {
      return {
        provider: "nvidia-free",
        baseUrl: NVIDIA_BASE_URL,
        apiKey: replaceFreeKey ? freeKey : savedFreeKey,
        model: NVIDIA_MODEL,
      };
    }
    return {
      provider: "byo",
      baseUrl: byoBaseUrl.trim(),
      apiKey: replaceByoKey ? byoKey : savedByoKey,
      model: byoModel.trim() || BYO_FALLBACK_MODEL,
    };
  }

  function maskKey(key: string): string {
    if (!key) return "";
    if (key.length <= 4) return "•".repeat(key.length);
    return "•".repeat(key.length - 4) + key.slice(-4);
  }

  async function handleSave() {
    setSaveMsg(null);
    setTestResult(null);
    const settings = currentSettings();
    if (mode === "byo" && !settings.baseUrl) {
      setSaveMsg("Base URL is required for BYO mode.");
      return;
    }
    if (!settings.apiKey) {
      setSaveMsg("Please enter an API key.");
      return;
    }
    try {
      await setAISettings(settings);
      // After save, switch to masked display of the new key.
      if (mode === "nvidia-free") {
        setSavedFreeKey(settings.apiKey);
        setReplaceFreeKey(false);
      } else {
        setSavedByoKey(settings.apiKey);
        setReplaceByoKey(false);
      }
      setSaveMsg("Settings saved.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const result = await testConnection(currentSettings());
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return <div className="jf-center">Loading…</div>;

  return (
    <div className="jf-form">
      <div className="jf-toggle" role="radiogroup" aria-label="AI provider mode">
        <label className={`jf-toggle-option${mode === "nvidia-free" ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="ai-mode"
            checked={mode === "nvidia-free"}
            onChange={() => setMode("nvidia-free")}
          />
          Use free tier (NVIDIA)
        </label>
        <label className={`jf-toggle-option${mode === "byo" ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="ai-mode"
            checked={mode === "byo"}
            onChange={() => setMode("byo")}
          />
          Bring your own key
        </label>
      </div>

      {mode === "nvidia-free" ? (
        <div className="jf-field">
          <p className="jf-hint">
            Get a free NVIDIA NIM API key (no credit card) at{" "}
            <a href="https://build.nvidia.com" target="_blank" rel="noreferrer">
              build.nvidia.com
            </a>
            . Base URL and model are pre-filled.
          </p>
          <label className="jf-label" htmlFor="ai-free-key">
            NVIDIA API key
          </label>
          {replaceFreeKey || !savedFreeKey ? (
            <input
              id="ai-free-key"
              type="password"
              className="jf-input"
              value={freeKey}
              onChange={(e) => setFreeKey(e.target.value)}
              placeholder="nvapi-…"
            />
          ) : (
            <div className="jf-masked-row">
              <code className="jf-masked">{maskKey(savedFreeKey)}</code>
              <button
                type="button"
                className="jf-btn jf-btn-ghost jf-btn-sm"
                onClick={() => setReplaceFreeKey(true)}
              >
                Replace key
              </button>
            </div>
          )}
          <div className="jf-field">
            <label className="jf-label" htmlFor="ai-free-base">
              Base URL (pre-filled)
            </label>
            <input id="ai-free-base" className="jf-input" value={NVIDIA_BASE_URL} readOnly />
          </div>
          <div className="jf-field">
            <label className="jf-label" htmlFor="ai-free-model">
              Model (pre-filled)
            </label>
            <input id="ai-free-model" className="jf-input" value={NVIDIA_MODEL} readOnly />
          </div>
        </div>
      ) : (
        <div className="jf-field">
          <label className="jf-label" htmlFor="ai-byo-base">
            Base URL
          </label>
          <input
            id="ai-byo-base"
            className="jf-input"
            value={byoBaseUrl}
            onChange={(e) => setByoBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <label className="jf-label" htmlFor="ai-byo-key">
            API key
          </label>
          {replaceByoKey || !savedByoKey ? (
            <input
              id="ai-byo-key"
              type="password"
              className="jf-input"
              value={byoKey}
              onChange={(e) => setByoKey(e.target.value)}
              placeholder="sk-…"
            />
          ) : (
            <div className="jf-masked-row">
              <code className="jf-masked">{maskKey(savedByoKey)}</code>
              <button
                type="button"
                className="jf-btn jf-btn-ghost jf-btn-sm"
                onClick={() => setReplaceByoKey(true)}
              >
                Replace key
              </button>
            </div>
          )}
          <label className="jf-label" htmlFor="ai-byo-model">
            Model
          </label>
          <input
            id="ai-byo-model"
            className="jf-input"
            value={byoModel}
            onChange={(e) => setByoModel(e.target.value)}
            placeholder={`Leave blank to use ${BYO_FALLBACK_MODEL}`}
          />
          <p className="jf-hint">Blank model defaults to {BYO_FALLBACK_MODEL}.</p>
        </div>
      )}

      {testResult && (
        <p className={`jf-status ${testResult.ok ? "jf-status-ok" : "jf-error"}`}>
          {testResult.message}
        </p>
      )}

      <div className="jf-actions">
        <button
          type="button"
          className="jf-btn jf-btn-ghost"
          onClick={() => void handleTest()}
          disabled={testing}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button type="button" className="jf-btn jf-btn-primary" onClick={() => void handleSave()}>
          Save
        </button>
        {onBack && (
          <button type="button" className="jf-btn jf-btn-ghost" onClick={onBack}>
            Back
          </button>
        )}
      </div>
      {saveMsg && <p className="jf-status">{saveMsg}</p>}
    </div>
  );
}
