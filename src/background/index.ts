import { runMigrations } from "../lib/storage";

/**
 * Jobinzy background service worker.
 *
 * Phase 0: minimal entry point so the manifest's service worker resolves.
 * Phase 1.2: runs schema migrations on install/startup.
 * Phase 4.1 adds the action.onClicked injection trigger.
 * No content script is ever injected automatically — everything happens
 * from the toolbar click handler.
 */
console.log("[Jobinzy] background service worker started");

chrome.runtime.onInstalled.addListener(() => {
  void runMigrations();
});
chrome.runtime.onStartup.addListener(() => {
  void runMigrations();
});
