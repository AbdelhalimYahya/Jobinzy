/* eslint-disable react-refresh/only-export-components */
import { createRoot } from "react-dom/client";
import "./options.css";

/**
 * Jobinzy options page — the single React UI surface for the extension.
 *
 * Design decision (noted in README.md): the toolbar action has NO default
 * popup. MV3 fires `chrome.action.onClicked` only when no `default_popup` is
 * declared, and Phase 4.1 relies on that event to trigger content-script
 * injection. All extension UI (onboarding, profile editing, AI settings,
 * answer bank management) therefore lives on this options page.
 */
function OptionsApp() {
  return <div>Extension UI loading...</div>;
}

createRoot(document.getElementById("root")!).render(<OptionsApp />);
