import { useEffect, useState } from "react";
import { debugWarn } from "../../lib/debug";
import type { Profile } from "../../lib/types";
import { getProfile, setMeta, setProfile } from "../../lib/storage";
import { OnboardingForm } from "./OnboardingForm";
import { CvUploadStep } from "./CvUploadStep";
import { StyleStep } from "./StyleStep";
import { QaStep } from "./QaStep";

const STEP_LABELS = ["Profile", "CV", "Style", "Q&A"];

interface Props {
  /** "edit" mode reuses the same steps pre-filled, saving without onboarding gate. */
  mode?: "onboarding" | "edit";
  onFinished: () => void;
}

/**
 * Onboarding wizard (tasks 2.1–2.7, 2.9).
 *
 * Resume strategy (documented decision): data is persisted to storage at the
 * end of EACH step, so an interrupted onboarding never loses work — the
 * wizard re-hydrates from `getProfile()` on mount and restarts from step 1
 * with every already-entered field pre-filled ("restart from 2.1 with data").
 * `onboardingComplete` is only set true in `finalize()` after every step
 * has written its data.
 */
export function OnboardingWizard({ mode = "onboarding", onFinished }: Props) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const existing = await getProfile();
      setProfileState(
        existing ?? {
          fullName: "",
          email: "",
          phone: "",
          nationalId: "",
          links: [],
          cvText: "",
          structuredCv: { education: [], experience: [], skills: [] },
          onboardingQA: [],
          defaultStyle: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      setReady(true);
    })();
  }, []);

  function persist(next: Profile) {
    setProfileState(next);
    // Persist after every step so interrupted onboarding resumes cleanly.
    void setProfile(next).catch((err) =>
      debugWarn("[Jobinzy] failed to persist onboarding step:", err)
    );
  }

  function nextStep(patch: Partial<Profile>) {
    if (!profile) return;
    persist({ ...profile, ...patch });
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  async function finalize() {
    if (!profile) return;
    // Ensure everything written so far is flushed, then flip the gate — only
    // the onboarding path may set onboardingComplete (edit mode never does).
    await setProfile(profile).catch(() => {});
    if (mode === "onboarding") {
      await setMeta({ onboardingComplete: true });
    }
    onFinished();
  }

  if (!ready) {
    return <div className="jf-center">Loading…</div>;
  }
  if (!profile) return null;

  const heading =
    mode === "edit" ? "Edit your profile" : "Set up Jobinzy in a minute";

  return (
    <div className="jf-wizard">
      <header className="jf-wizard-header">
        <h1 className="jf-title">{heading}</h1>
        {mode === "onboarding" && (
          <ol className="jf-steps" aria-label="Onboarding progress">
            {STEP_LABELS.map((label, i) => (
              <li
                key={label}
                className={`jf-step${i === step ? " is-active" : ""}${
                  i < step ? " is-done" : ""
                }`}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>
        )}
      </header>

      <div className="jf-card">
        {step === 0 && (
          <OnboardingForm
            key="profile"
            initial={profile}
            onSubmit={(p) => nextStep({ ...p })}
          />
        )}
        {step === 1 && (
          <CvUploadStep
            onDone={(r) =>
              nextStep({
                cvText: r.cvText,
                cvFileName: r.cvFileName,
                structuredCv: r.structuredCv,
              })
            }
            onSkip={() => nextStep({ cvText: profile.cvText })}
          />
        )}
        {step === 2 && (
          <StyleStep
            initial={profile.defaultStyle}
            onDone={(style) => nextStep({ defaultStyle: style })}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <QaStep
            initial={profile.onboardingQA}
            onDone={(qa) => nextStep({ onboardingQA: qa })}
            onBack={() => setStep(2)}
          />
        )}
      </div>

      {step === STEP_LABELS.length - 1 && (
        <div className="jf-card jf-finalize">
          <p className="jf-hint">
            You're all set. Jobinzy will now autofill your profile details on
            application forms and draft open-ended answers in your style.
          </p>
          <button type="button" className="jf-btn jf-btn-primary" onClick={() => void finalize()}>
            {mode === "edit" ? "Save changes" : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}
