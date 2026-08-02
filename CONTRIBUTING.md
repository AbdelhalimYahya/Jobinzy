# Contributing to Jobinzy

Thanks for taking the time to contribute! 🎉 Jobinzy is a local-first Chrome
extension for job seekers, and every contribution — bug reports, feature
ideas, docs, and code — is appreciated.

Please read this guide before opening an issue or pull request.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Project overview](#project-overview)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Code conventions](#code-conventions)
- [Testing](#testing)
- [Commit message style](#commit-message-style)
- [Pull request checklist](#pull-request-checklist)
- [Where things live](#where-things-live)

---

## Code of conduct

Be kind and respectful. This project is open to everyone regardless of
experience level, background, or opinion. Harassment, trolling, and
dismissive responses are not welcome. If you see a problem, say so calmly
and constructively.

## Project overview

Jobinzy scans the DOM of any job application page, matches fields against a
locally-stored profile, drafts open-ended answers with AI, and shows a
floating review panel. Everything is local-first and **never** auto-submits.

Before diving in, read these in order:

1. **`plan.md`** (local-only, gitignored) — the full product spec: design
   decisions, data model, and the complete phase-by-phase micro-task
   breakdown. If you don't have it locally, the essentials are captured in
   the README and `src/lib/types.ts`.
2. **`AGENT.md`** — the process rules the build follows (commit-per-task,
   verification gates, code-organization expectations). Human contributors
   should follow the same conventions where they make sense.
3. **`test.md`** — the manual test procedures and acceptance criteria.

## Getting started

```bash
# 1. Clone and install
git clone https://github.com/AbdelhalimYahya/Jobinzy.git
cd Jobinzy
npm install

# 2. Build
npm run build          # typecheck + production build → dist/

# 3. Load unpacked in Chrome
# chrome://extensions → Developer mode → "Load unpacked" → select dist/
```

For iteration, `npm run dev` rebuilds `dist/` on every change; reload the
extension card in `chrome://extensions` after a rebuild.

## Development workflow

1. **Create a branch** from `main` (or the most recent release branch):
   ```bash
   git checkout -b feat/my-change
   ```
2. **Make small, focused commits** — one commit per logical task, following
   the [commit style](#commit-message-style) below. The build plan numbers
   tasks (e.g. `5.3 rule-based field classifier`); reference them when
   relevant.
3. **Run the checks** before pushing:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
4. **Open a pull request** against `main` with a clear description of what
   you changed and why. Reference any related issues.

## Code conventions

These keep the three runtime surfaces clean and the privacy guarantees
enforceable. They are hard rules — reviews will ask for changes if they're
violated:

- **No raw `chrome.storage` calls outside `src/lib/storage.ts`.** Every read
  and write goes through the typed storage module's functions
  (`getProfile`, `setProfile`, `getAnswerBank`, `upsertAnswerBankEntry`,
  `getAISettings`, `setAISettings`, `getMeta`, `setMeta`, …).
- **No raw `fetch` to an AI endpoint outside `src/lib/aiClient.ts`.** All AI
  work (CV structuring, answer generation, rewrites, classification)
  imports `generate` / `testConnection` from that one client.
- **No automatic file attachment.** File/upload fields are detected and
  surfaced as helper notices only — never auto-filled.
- **Manual trigger only.** The content script is injected from the toolbar
  click handler; never add a static `content_scripts` entry or
  `host_permissions` to the manifest.
- **Don't break the data model.** `Profile`, `AnswerBankEntry`, and
  `AISettings` must match `src/lib/types.ts`. If a shape changes, bump
  `CURRENT_SCHEMA_VERSION` in `src/lib/storage.ts` and add a migration.
- **Keep the manifest minimal.** Permissions stay at
  `["storage", "activeTab", "scripting"]`.
- **TypeScript throughout** — no plain `.js` in `src/`; typecheck must pass.
- **Formatting & linting** — ESLint + Prettier are configured; run
  `npm run lint` (and optionally `npm run format`) before committing.

## Testing

### Unit tests

```bash
npm run test                 # run once
npm run test:watch           # watch mode
```

New logic should come with unit tests (Vitest + Testing Library), following
the existing patterns in `src/**/*.test.ts(x)`.

### Manual end-to-end

The `test-pages/` folder has static HTML harnesses that mimic real job
forms (Google Forms-style, MS Forms-style, Wuzzuf Arabic/RTL, generic,
async-rendered, iframe-embedded, recurring-question pairs):

```bash
npx serve test-pages
```

Load the extension unpacked, open a harness page, and click the toolbar
button. See `test-pages/README.md` for the page-by-page guide. Always test
on at least one real page before marking a UI/content-script task done.

## Commit message style

Use **conventional commits** with a task reference where it applies:

```
<type>: <task-ref> <short summary>

<optional body explaining what and why>
```

- `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
  `style`, `build`, `ci`.
- `task-ref`: the plan task number when the change maps to one, e.g. `5.3`.

Examples:

```
feat: 5.3 rule-based field classifier

Adds EN/AR keyword maps resolving field labels to ProfileFieldKey.
```

```
fix: 9.1 dispatch native input events on fill

Frameworks like React don't see plain .value writes; dispatch input/change
so custom widgets update.
```

## Pull request checklist

Before opening a PR, confirm:

- [ ] Branch is up to date with `main`.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (new tests added for new behavior).
- [ ] `npm run build` succeeds.
- [ ] UI/content-script changes verified on a real page (or a `test-pages/`
      harness).
- [ ] No raw `chrome.storage` / AI `fetch` outside the allowed modules.
- [ ] Manifest permissions unchanged unless the PR deliberately (and
      with justification) changes them.
- [ ] `plan.md` checkboxes updated for any task the PR completes (if you
      have the local copy).

## Where things live

| Path | What's in it |
| --- | --- |
| `src/background/` | Service worker — toolbar-click injection trigger |
| `src/content/` | Injected content script + floating review panel |
| `src/lib/` | Shared framework-free modules (storage, aiClient, detector, cvParser, types) |
| `src/ui/` | Options page: onboarding, settings, answer bank |
| `test-pages/` | Manual-test harnesses (not shipped) |
| `scripts/` | Icon generator, store-zip packager |
| `privacy-policy.html`, `PERMISSIONS.md`, `STORE-LISTING.md` | Store-readiness docs |
