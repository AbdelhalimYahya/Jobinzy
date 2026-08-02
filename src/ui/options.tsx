/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getMeta } from "../lib/storage";
import { OnboardingWizard } from "./onboarding/OnboardingWizard";
import { AISettingsForm } from "./settings/AISettingsForm";
import { AnswerBankView } from "./bank/AnswerBankView";
import { ClearDataControl } from "./settings/ClearDataControl";
import "./options.css";

type View =
  | "loading"
  | "onboarding"
  | "home"
  | "edit-profile"
  | "ai-settings"
  | "answer-bank";

/**
 * Jobinzy options page — the single React UI surface.
 *
 * Design decision (README.md): no toolbar popup; MV3 fires
 * `chrome.action.onClicked` only with no `default_popup`, which Phase 4.1
 * relies on. All UI (onboarding, profile editing, AI settings, answer bank)
 * lives here.
 *
 * 2.7/2.9: if onboarding is incomplete, the wizard shows (and resumes from
 * the last completed step on every reopen). 2.8: "Edit Profile" reopens the
 * same wizard in edit mode, pre-filled, saving without touching the gate.
 */
function OptionsApp() {
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    void (async () => {
      const meta = await getMeta();
      setView(meta.onboardingComplete ? "home" : "onboarding");
    })();
  }, []);

  if (view === "loading") return <div className="jf-center">Loading…</div>;

  if (view === "onboarding") {
    return <OnboardingWizard mode="onboarding" onFinished={() => setView("home")} />;
  }

  if (view === "edit-profile") {
    return (
      <OnboardingWizard
        mode="edit"
        onFinished={() => setView("home")}
      />
    );
  }

  if (view === "ai-settings") {
    return (
      <div className="jf-home">
        <header className="jf-home-header">
          <h1 className="jf-title">AI settings</h1>
        </header>
        <AISettingsForm onBack={() => setView("home")} />
      </div>
    );
  }

  if (view === "answer-bank") {
    return (
      <div className="jf-home">
        <header className="jf-home-header">
          <h1 className="jf-title">Saved answers</h1>
        </header>
        <AnswerBankView onBack={() => setView("home")} />
      </div>
    );
  }

  return (
    <div className="jf-home">
      <header className="jf-home-header">
        <h1 className="jf-title">Jobinzy</h1>
        <p className="jf-hint">
          Click the Jobinzy toolbar button on any job application page to
          detect the form and open the review panel.
        </p>
      </header>

      <nav className="jf-nav">
        <button className="jf-btn jf-btn-primary" onClick={() => setView("edit-profile")}>
          Edit profile
        </button>
        <button className="jf-btn jf-btn-ghost" onClick={() => setView("ai-settings")}>
          AI settings
        </button>
        <button className="jf-btn jf-btn-ghost" onClick={() => setView("answer-bank")}>
          Saved answers
        </button>
      </nav>

      {/* 12.5 — destructive action, clearly separated from normal settings. */}
      <div className="jf-danger-wrap">
        <ClearDataControl onCleared={() => setView("onboarding")} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OptionsApp />);
