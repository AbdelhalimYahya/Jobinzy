/// <reference types="vite/client" />

/**
 * CRXJS `?script` import — bundles the imported file as a standalone script
 * and returns the path to the built output, for use with
 * chrome.scripting.executeScript({ files: [...] }).
 */
declare module "*?script" {
  const src: string;
  export default src;
}
