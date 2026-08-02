# Permission Justifications — Jobinzy

Each permission requested in `manifest.json` is listed below with exactly what
it is used for in the shipped code.

## `storage`

Used by every data persistence feature. The typed storage module
(`src/lib/storage.ts`) stores the user's profile (including their CV text,
national ID, and links), the answer bank of saved answers, AI provider
settings, and the onboarding-complete flag in `chrome.storage.local` —
nothing is sent to any server. See `privacy-policy.html` for the full data
model. This is the only permission the extension needs for its core
local-first design.

## `activeTab`

Grants temporary access to the current tab's page *only after* the user
clicks the Jobinzy toolbar button (Phase 4.1, `src/background/index.ts`). It
is what allows the extension to inject the detector into the page the user is
currently looking at, without requesting broad access to every website.
Access ends when the user navigates away or closes the tab. Without it the
extension could not read the form fields it is asked to detect.

## `scripting`

Used together with `activeTab` to programmatically inject the content script
into the current tab when the toolbar button is clicked
(`chrome.scripting.executeScript` in `src/background/index.ts`, Phase 4.1).
The content script is deliberately *not* declared as a static
`content_scripts` entry — injection only ever happens on an explicit click,
so the extension never runs on pages unless the user asks it to.
