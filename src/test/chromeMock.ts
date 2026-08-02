/**
 * In-memory `chrome.storage.local` mock for Vitest. Registers a global
 * `chrome` object with a working `storage.local` (get/set/remove) backed by
 * a plain object, plus a `runtime` stub with openOptionsPage/onInstalled.
 *
 * Import this in a test before importing any module that touches chrome APIs.
 */
export function installChromeMock(): void {
  const store = new Map<string, unknown>();

  const storageLocal = {
    async get(key: string | string[] | Record<string, unknown> | null | undefined) {
      if (key == null) {
        return Object.fromEntries(store);
      }
      if (typeof key === "string") {
        return { [key]: store.get(key) };
      }
      if (Array.isArray(key)) {
        const out: Record<string, unknown> = {};
        for (const k of key) out[k] = store.get(k);
        return out;
      }
      // object with defaults
      const out: Record<string, unknown> = {};
      for (const [k, def] of Object.entries(key)) {
        out[k] = store.has(k) ? store.get(k) : def;
      }
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) store.delete(k);
    },
    async clear() {
      store.clear();
    },
  };

  (globalThis as Record<string, unknown>).chrome = {
    storage: { local: storageLocal },
    runtime: {
      openOptionsPage: () => Promise.resolve(),
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    scripting: {
      executeScript: () => Promise.resolve(),
    },
    action: {
      onClicked: { addListener: () => {} },
    },
  };
}

/** Resets the in-memory chrome.storage.local store between tests. */
export function resetChromeStore(): void {
  // Each installChromeMock() call creates a fresh module-level store, so
  // re-installing resets all state.
  (globalThis as Record<string, unknown>).chrome = undefined;
  installChromeMock();
}
