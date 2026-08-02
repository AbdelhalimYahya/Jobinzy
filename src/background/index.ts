import { getMeta, runMigrations } from "../lib/storage";
// `?script` tells CRXJS to bundle this file as a standalone script and
// return its built path — the ONLY way to dynamically inject TS content
// scripts with CRXJS. No static content_scripts entry exists in the manifest.
import contentScriptPath from "../content/index.tsx?script";

/**
 * Jobinzy background service worker.
 *
 * Phase 1.2: runs schema migrations on install/startup.
 * Phase 4.1/4.5: the toolbar click is the ONLY entry point. Nothing runs on
 * page load — clicking either injects the detector content script (when
 * onboarding is complete) or opens the options page (onboarding).
 */
console.log("[Jobinzy] background service worker started");

chrome.runtime.onInstalled.addListener(() => {
  void runMigrations();
});
chrome.runtime.onStartup.addListener(() => {
  void runMigrations();
});

chrome.action.onClicked.addListener((tab) => {
  void handleToolbarClick(tab);
});

async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  const meta = await getMeta();
  if (!meta.onboardingComplete) {
    // 4.5: fresh install → open onboarding instead of injecting.
    await chrome.runtime.openOptionsPage();
    return;
  }
  // 4.1: inject on demand. `activeTab` grants access to the current tab only.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [contentScriptPath],
  });
}
