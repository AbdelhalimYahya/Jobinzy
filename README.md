# Jobinzy

A Chrome extension for people applying to jobs. While you're on any job
application page (Google Forms, Microsoft Forms, Wuzzuf, or any other site),
click the **Jobinzy** toolbar button, and the extension:

1. Scans the page's DOM for form fields (generic — works on any site).
2. Autofills the obvious profile fields (name, email, phone, national ID,
   links) from your locally-saved profile, with no AI involved.
3. Drafts answers to open-ended questions using AI — fed with your CV,
   profile, the visible job context, and your tone/style preference.
4. Shows a floating review panel listing every detected field and its
   status, so you can edit, rewrite, skip, or fill before submitting.
5. Flags file-upload / link-request fields (CV, video intro, portfolio)
   so you never miss them, and lets you paste a link inline.
6. Remembers recurring questions in a local answer bank.

It **never submits a form** — you always click the real submit button
yourself.

## Design decisions

- **Manual trigger only.** Nothing runs on page load; the content script is
  injected only when you click the toolbar button (`activeTab` permission —
  no broad host permissions).
- **No toolbar popup.** The action has no `default_popup` because MV3 only
  fires `chrome.action.onClicked` when no popup is declared, and that event
  is what triggers injection. All extension UI (onboarding, profile editing,
  AI settings, answer bank) lives on the **options page** instead. It opens
  automatically during onboarding and from the detection panel.
- **Local-first.** All profile data, CV text, and the answer bank live in
  `chrome.storage.local`. No backend, no server, no Python — the only
  external call is the direct prompt you send to the AI provider you
  configured (NVIDIA free tier by default, or any OpenAI-compatible key).
- **No auto file attachment.** File inputs get a helper notice, never a
  silent auto-attach.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Build / develop

```bash
npm run dev        # dev build with HMR → dist/
npm run build      # production build → dist/
npm run lint       # ESLint
npm run test       # Vitest unit tests
```

The Vite dev server (`npm run dev`) emits the extension into `dist/` and
rebuilds on change.

### 3. Load the unpacked extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` folder (after a build).
4. The Jobinzy card appears in the toolbar. Pin it if you like.

That's it. First time you click the toolbar button you'll be walked through
onboarding (profile + optional CV + style). After that, clicking the button
on any job application page detects the form and opens the review panel.

## Project structure

```
src/
  background/   service worker — injection trigger (Phase 4)
  content/      injected content script + floating panel UI (Phases 4, 5, 8, 9)
  lib/          shared, framework-free modules: storage, aiClient, types,
                detector, answer generator, fill engine (Phases 1, 3, 5–7, 9)
  ui/           options page: onboarding, settings, answer bank (Phases 2, 3, 7)
  test/         Vitest setup
```

## Scripts

| Command         | What it does                          |
| --------------- | ------------------------------------- |
| `npm run dev`   | Dev build → `dist/` (watch mode)      |
| `npm run build` | Typecheck + production build → `dist/`|
| `npm run lint`  | ESLint over `src/`                    |
| `npm run test`  | Vitest unit tests                     |
| `npm run typecheck` | `tsc --noEmit`                    |
