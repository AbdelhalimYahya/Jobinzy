import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// Vite + CRXJS builds the Chrome extension (Manifest V3) from manifest.json.
// Content scripts are injected dynamically (Phase 4) via the "?script" import
// query, so no static content_scripts entry exists in the manifest.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
  },
});
