# Agent Instructions — Job Application Autofill Extension

You are building the project described in `plan.md`, which sits alongside
this file. Read `plan.md` in full before writing any code — it contains the
product spec, the explicit design decisions, the tech stack, the full data
model, and the complete micro-task breakdown by phase. This file tells you
*how* to work through that plan, not what to build — `plan.md` is the source
of truth for scope; this file is the source of truth for process.

## 1. Working method

- Work through the phases in `plan.md` **in order**: Phase 0 before Phase 1,
  etc. Do not jump ahead to a later phase while an earlier one has unchecked
  tasks, unless a task explicitly says it depends on something later.
- Treat each numbered task (e.g. `4.2`) as one unit of work: implement it,
  verify it does what it says, then mark it done by checking the box in
  `plan.md` (`- [ ]` → `- [x]`) before moving to the next task.
- After finishing a task, briefly state which task you completed and what
  you changed, then continue to the next one. Do not silently batch several
  tasks together without reporting them — the person reviewing your work
  needs to be able to follow along task by task.
- If a task is ambiguous or you have to make a judgment call not covered by
  `plan.md`, make the smallest reasonable decision, note what you decided
  and why in your response, and keep going — don't stall waiting for
  clarification unless the decision would contradict Section 2 of `plan.md`
  (the explicit design decisions) or Section 6 (out of scope).
- Commit logically: one git commit per completed task (or small group of
  tightly related tasks within the same phase), with a commit message that
  references the task number, e.g. `feat: 5.3 rule-based field classifier`.

## 2. Hard constraints — do not violate these

These come directly from `plan.md` Section 2 and Section 6. If you find
yourself about to do one of the following, stop and re-read the plan instead:

- Do not make the content script run automatically on page load. It only
  runs after the user clicks the trigger button (Phase 4). No broad host
  permissions in the manifest — `activeTab` + `scripting` + `storage` only.
- Do not implement automatic file attachment to `<input type="file">`
  elements. File/link fields are detected and surfaced as a helper notice
  only (Phase 5.5, Phase 8.3) — never auto-filled.
- Do not hardcode field detection to only work on Google Forms, Microsoft
  Forms, or Wuzzuf. Those three are test targets, not the whole scope —
  detection must be generic DOM analysis that works on unfamiliar pages too.
- Do not build a backend, database server, or any Python component. This is
  a browser-extension-only project in v1. All storage is `chrome.storage.local`.
  All AI calls go directly from the extension to the configured
  OpenAI-compatible endpoint.
- Do not implement embeddings or vector similarity for the answer bank.
  Question matching is normalized string matching only (Phase 7.2).
- Do not add support for any AI provider whose API isn't OpenAI-compatible.
  The two supported paths are NVIDIA NIM (free) and BYO OpenAI-compatible
  key/base URL — both go through the same client module.
- Never skip the explicit National ID field or fold it into a generic
  "extra info" box — it must be its own clearly labeled onboarding field
  (Phase 2.1).

## 3. Code organization expectations

- Keep the three runtime surfaces cleanly separated in the project structure:
  - `content/` — the injected content script and the floating panel UI logic
    (Phases 4, 5, 8, 9).
  - `background/` or a service worker entry — handles `chrome.scripting`
    injection trigger and anything that must run outside a page context.
  - `ui/` — onboarding, options page, and any settings screens (Phases 2, 3).
  - `lib/` — shared, framework-free modules: `storage.ts`, `aiClient.ts`,
    `types.ts`, the field detector, the answer generator, the fill engine.
    These should be usable from both `content/` and `ui/` without
    duplication.
- No raw `chrome.storage.local.get/set` calls outside `lib/storage.ts`. Every
  other module reads/writes through that module's typed functions.
- No raw `fetch` calls to an AI endpoint outside `lib/aiClient.ts`. Every
  feature that needs AI output (CV parsing, open-ended answer generation,
  rewrites) goes through that one client.
- Match the data model in `plan.md` Section 4 exactly for `Profile`,
  `AnswerBankEntry`, and `AISettings` — if a task needs a field that isn't
  in that model, add it to the model in both `plan.md` and `types.ts`
  together, don't let them drift apart.

## 4. Verification before checking a task off

Before marking any task complete:
- The extension must still build cleanly (`npm run build` or the project's
  equivalent) with no new TypeScript errors.
- If the task touches the content script or panel UI, manually load the
  unpacked extension and confirm the behavior on at least one real page —
  don't mark a UI task done from reading the code alone.
- If the task touches storage or the data model, confirm existing stored
  data doesn't break (respect the `schemaVersion` guard from Phase 1.2).

## 5. When you reach Phase 11 (manual testing) and beyond

Phases 11–13 involve real-world testing (Google Forms, Microsoft Forms,
Wuzzuf) and store publishing steps that need a human — API keys, a Chrome
Web Store developer account, and real judgment calls on store listing copy.
Do as much as you can autonomously (building test pages, drafting the
privacy policy text, preparing the zip build), but clearly flag any step
that requires the person's direct action (paying the $5 fee, pasting in
their own NVIDIA/OpenAI key, clicking submit on the Web Store dashboard)
rather than attempting to do it for them.

## 6. If plan.md and this file ever conflict

`plan.md` wins on *what* to build (scope, data model, design decisions).
This file wins on *how* to work (process, verification, code organization).
If a plan.md task seems to require breaking a Section 2 constraint, stop and
flag the conflict instead of guessing which one to follow.
