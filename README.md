<div align="center">

# 🔍 Jobinzy

**Autofill job applications from your saved profile — with AI drafts for open-ended questions.**

Your data stays on your device. Jobinzy never submits a form; you always press the real submit button yourself.

<p>
  <img src="public/icons/icon128.png" alt="Jobinzy logo" width="128" height="128">
</p>

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![CI](https://github.com/AbdelhalimYahya/Jobinzy/actions/workflows/ci.yml/badge.svg)](https://github.com/AbdelhalimYahya/Jobinzy/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a73e8.svg)](https://developer.chrome.com/docs/extensions/develop/concepts/manifest)

---

**📖 Documentation:** [Getting started](#-getting-started) · [AI provider setup](#-ai-provider-setup) · [Privacy](#-privacy) · [Project structure](#-project-structure) · [Scripts](#-scripts) · [Testing](#-testing) · [Publishing](#-publishing-to-the-chrome-web-store) · [Contributing](CONTRIBUTING.md) · [License](#-license)

</div>

---

## ✨ What it does

Jobinzy is a Chrome extension for people applying to many jobs and retyping the same details every time. While you're on **any** job application page — Google Forms, Microsoft Forms, Wuzzuf, or a plain company careers page — click the toolbar button and:

1. **Detects every form field** on the page (generic DOM analysis — not hardcoded to any platform).
2. **Autofills the obvious profile fields** (name, email, phone, national ID, links) straight from your locally-saved profile — zero AI calls, instant.
3. **Drafts answers to open-ended questions** ("Why are you a good fit for this role?") using AI fed with your CV, your profile, the visible job context, and your tone/style preference.
4. **Shows a floating review panel** listing every detected field and its status, so you can review, edit, rewrite with new instructions, skip, or leave fields for manual entry — before *or* after filling.
5. **Flags file-upload / link-request fields** (CV, video intro, portfolio, Drive link) instead of silently auto-attaching — it tells you "this form wants X" and lets you paste a link inline.
6. **Remembers recurring questions** in a local answer bank — the next form that asks the same thing is already filled, and you can overwrite any saved answer at any time.

> 🚫 **Jobinzy never auto-submits a form.** It only fills fields. The human always reviews and clicks the real submit button.

## 🎯 Key features

| Feature | Description |
| --- | --- |
| ⚡ **Instant autofill** | Name, email, phone, national ID, and links (LinkedIn, portfolio, GitHub, Drive) matched by a bilingual EN/AR rule-based classifier — no AI needed for these. |
| 🤖 **AI drafts** | Open-ended answers generated from your CV + profile + question, respecting your saved answering style. |
| ✍️ **Rewrite with instructions** | Tell the AI "make it shorter / more formal / mention my React experience" — per field, per session. |
| 🧠 **Answer bank** | Recurring questions matched by normalized text and served from your local bank; rewrite to overwrite for that exact question. |
| 📎 **File & link helper** | CV/video/portfolio requests flagged with guidance — never auto-attached, paste a link inline where it fits. |
| 🔒 **Local-first & private** | Everything in `chrome.storage.local`. No backend, no accounts, no tracking. |
| 🌍 **Bilingual + RTL-safe** | Arabic keyword maps and RTL-safe panel layout for MENA job sites (Wuzzuf and friends). |
| ♿ **Accessible** | Keyboard-navigable panel (tab order, visible focus, Escape to close), per-field loading states. |
| 🧩 **Generic detector** | Works on unfamiliar forms, async-rendered fields, and same-origin iframes — not just the big platforms. |

## 🚀 Getting started

### Prerequisites

- **Node.js** ≥ 18 (Node 20/22 recommended)
- **Chrome** (or Chromium-based browser)

### 1. Install dependencies

```bash
npm install
```

### 2. Build the extension

```bash
npm run build      # typechecks + production build → dist/
```

For development with live rebuilds:

```bash
npm run dev        # watch mode → dist/
```

### 3. Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` folder.
4. Pin the Jobinzy icon to the toolbar for easy access.

### 4. First run

1. Click the Jobinzy toolbar icon → the onboarding flow opens automatically (your profile + optional CV + answering style).
2. Add an AI provider key in **Options → AI Settings** (see [AI provider setup](#-ai-provider-setup)) — without a key, profile fields still autofill but AI drafts won't generate.
3. Open any job application page → click **Jobinzy** → **Detect Form** → review the panel → **Fill form** → *you* click submit.

> 💡 The toolbar icon has **no popup** by design: in Manifest V3, `chrome.action.onClicked` only fires when no popup is declared, and that click is exactly what triggers detection. All extension UI lives on the options page.

## 🔑 AI provider setup

Jobinzy supports **any OpenAI-compatible** endpoint. Two presets:

### Option A — NVIDIA free tier (default, $0)

1. Create a free account at [build.nvidia.com](https://build.nvidia.com) (no credit card).
2. Generate a free API key.
3. Open **Options → AI Settings → Use free tier (NVIDIA)** and paste the key.
4. Click **Test connection** — you should see a green success message.

### Option B — Bring your own key (OpenAI or any compatible provider)

1. Open **Options → AI Settings → Bring your own key**.
2. Enter your `baseUrl`, `apiKey`, and `model` (e.g. `https://api.openai.com/v1`, `gpt-4o-mini`).
3. Click **Test connection**.

Your key is stored locally and **masked in the UI** (only the last 4 characters shown until you choose "Replace key").

## 🔒 Privacy

- **Local-first.** Your profile (including national ID), CV text, and answer bank live only in `chrome.storage.local` on your device.
- **No backend.** There is no developer-operated server. Nothing is sent anywhere except the AI prompts you explicitly trigger, sent **directly** to the AI provider you configured.
- **Narrow permissions.** The manifest requests only `storage`, `activeTab`, and `scripting` — no broad host permissions. The content script runs only when you click the button, never on page load.
- **You're in control.** Nothing is filled without your review, nothing is submitted by the extension, and **Options → Clear all my data** wipes everything (profile, answer bank, AI settings) with a confirmation step.

Full details: [privacy-policy.html](privacy-policy.html) · [PERMISSIONS.md](PERMISSIONS.md)

## 🧩 Project structure

```
jobinzy/
├── src/
│   ├── background/        Service worker — toolbar-click injection trigger
│   ├── content/           Injected content script + floating review panel UI
│   ├── lib/               Shared framework-free modules
│   │   ├── detector/      Field scanner, context extraction, EN/AR classifiers
│   │   ├── storage.ts     Typed chrome.storage.local layer + migrations
│   │   ├── aiClient.ts    The ONLY module that talks to AI endpoints
│   │   ├── cvParser.ts    Client-side PDF text extraction + AI CV structuring
│   │   └── types.ts       Profile, AnswerBankEntry, AISettings, DetectedField…
│   └── ui/                Options page: onboarding, settings, answer bank
├── test-pages/            Manual-test harnesses for the extension (not shipped)
├── scripts/
│   ├── gen-icons.mjs      Generates extension icons
│   └── zip.mjs            Packages dist/ into a store-ready zip
├── privacy-policy.html    Privacy policy source (publish before store submission)
├── PERMISSIONS.md         Permission justifications for the store
├── STORE-LISTING.md       Store descriptions, screenshots, and submission checklist
├── test.md                Manual test procedures (Phases 11–13)
├── plan.md                The full build plan (local-only, gitignored)
└── manifest.json          Manifest V3 configuration
```

## 🛠️ Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev build → `dist/` (watch mode, HMR) |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src/` |
| `npm run test` | Vitest unit tests (run once) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run package` | `build` + zip → `release/jobinzy.zip` (manifest at zip root) |

## 🧪 Testing

### Unit tests

```bash
npm run test
```

### Manual end-to-end harnesses

The `test-pages/` folder contains static HTML pages that mimic real job-application form structures (Google Forms-style, MS Forms-style, Wuzzuf-style Arabic/RTL, generic careers page, async-rendered, iframe-embedded, recurring-question pairs) so you can exercise the full flow without live accounts.

```bash
npx serve test-pages
```

Then open a page (e.g. `http://localhost:3000/11.1-google-forms.html`), click **Jobinzy → Detect Form**, and work the panel. See [test-pages/README.md](test-pages/README.md) for the page-by-page guide and [test.md](test.md) for the full manual test procedures.

## 📦 Publishing to the Chrome Web Store

> ⚠️ The store steps marked **human-required** (developer account, screenshots, final submit) can't be automated — they need your real account and judgment.

1. **Build the store zip:**
   ```bash
   npm run package   # → release/jobinzy.zip (manifest.json at the zip root)
   ```
2. **Register as a developer** at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee + trader declaration).
3. **Host the privacy policy** at a public URL (see [privacy-policy.html](privacy-policy.html)) — the store requires it for extensions handling personal data.
4. **Capture screenshots** (1280×800) of the panel in use — shot list in [STORE-LISTING.md](STORE-LISTING.md).
5. **Create the listing** — upload the zip, paste the descriptions from [STORE-LISTING.md](STORE-LISTING.md), attach icons (`public/icons/`) and the privacy policy URL.
6. **Submit for review** — if rejected, the dashboard tells you why; fix and resubmit.

The `release/` folder is gitignored; the zip is a build artifact, not source.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers the development workflow, code conventions, commit style, and the PR checklist.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with** TypeScript · React · Vite · CRXJS · pdf.js · Manifest V3

</div>
