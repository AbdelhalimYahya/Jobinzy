# Test Plan — Job Application Autofill Extension

This file mirrors the task numbering in `plan.md` exactly. After finishing
each micro-task, run the matching test(s) below **before** checking that
task's box in `plan.md`. If a test fails, fix the task — do not move on and
do not check the box until it passes.

General rule for every task: the project must build with no new TypeScript
errors, and the unpacked extension must still load in `chrome://extensions`
without errors in the console.

---

### Phase 0 — Project scaffolding

- **0.1** Run `git status` — confirm `node_modules/` and `dist/` are not
  tracked. Confirm `git log` shows an initial commit.
- **0.2** Run the project's dev/build command — confirm it completes with no
  errors and produces output in `dist/`.
- **0.3** Open `dist/manifest.json` — confirm `manifest_version: 3`, and that
  `permissions` contains only `storage`, `activeTab`, `scripting` (no host
  permissions, no `<all_urls>`).
- **0.4** Load `dist/` as an unpacked extension in `chrome://extensions`.
  Confirm it appears with no red "Errors" badge.
- **0.5** Confirm the popup/options entry renders a blank React root with no
  console errors when opened.
- **0.6** Confirm `types.ts` compiles and exports `Profile`, `AnswerBankEntry`,
  `AISettings` matching `plan.md` Section 4 field-for-field.

### Phase 1 — Storage layer

- **1.1** Write a temporary test script (console or a debug button) that
  calls `setProfile({...dummy})` then `getProfile()` and confirms the
  returned object matches what was set.
- **1.2** Confirm a stored object includes `schemaVersion`. Manually edit
  stored data to an "old" shape and confirm reading it doesn't throw.
- **1.3** Confirm `getAnswerBank`/`upsertAnswerBankEntry` and
  `getAISettings`/`setAISettings` round-trip correctly the same way as 1.1.
  Delete the temporary test script/button once confirmed.

### Phase 2 — Onboarding flow

- **2.1** Open onboarding UI. Fill name, email, phone, national ID
  (confirm the label explicitly says "National ID"), address, and add two
  links. Submit and confirm via `getProfile()` that all values were saved
  correctly, including both links.
- **2.2** Upload a real PDF CV. Confirm the file is accepted and no error is
  thrown for a typical multi-page PDF.
- **2.3** After upload, confirm `cvText` in storage contains readable text
  extracted from the PDF (spot-check a sentence from the source file appears).
- **2.4** Confirm `structuredCv.education/experience/skills` are populated
  after upload. Test with a CV that has an unusual/minimal format and
  confirm the flow still completes (falls back to raw text, doesn't crash).
- **2.5** Set a `defaultStyle` value, confirm it's saved and reloading the
  onboarding/options screen shows the saved value pre-filled.
- **2.6** Fill in 2-3 onboarding Q&A entries, confirm they appear in
  `onboardingQA` in storage.
- **2.7** Complete onboarding fully, close and reopen the extension, confirm
  it recognizes onboarding is already done and doesn't show the onboarding
  screen again (goes straight to the main UI).

### Phase 3 — AI settings

- **3.1** Confirm both "Use free tier" and "Bring your own key" modes are
  selectable and switching between them doesn't lose previously entered
  values in the other mode.
- **3.2** Confirm the NVIDIA guided instructions link opens/points to
  build.nvidia.com, and pasting a key saves it.
- **3.3** Confirm BYO fields (base URL, key, model) all save correctly and
  a blank model field falls back to the documented default.
- **3.4** With a real, valid key entered, click "Test connection" — confirm
  it reports success. Enter an invalid key — confirm it reports a clear
  failure message (not a silent failure or a raw stack trace).
- **3.5** Call `aiClient` directly with a trivial prompt against a real
  configured provider — confirm it returns text and that swapping between
  NVIDIA and BYO settings both work through the same function call.

### Phase 4 — In-page trigger and content script injection

- **4.1** Click the toolbar button on a normal webpage. Confirm the content
  script is injected only on click, not already present on page load
  (check via `chrome://extensions` inspect views or a console log before
  clicking).
- **4.2** Confirm the floating "Detect Form" button appears after injection,
  positioned sensibly (not overlapping critical page content), and its
  styles don't leak onto/from the host page (shadow DOM isolation check —
  inspect the host page's own styles are unaffected).
- **4.3** Click "Detect Form" — confirm detection runs (Phase 5 output) and
  the review panel opens (Phase 8 UI).
- **4.4** Click the toolbar button a second time on the same tab — confirm
  no duplicate floating button/panel appears. Close the panel — confirm it
  fully disappears and re-triggering still works.

### Phase 5 — Field detection engine

- **5.1** On a page with a mix of `<input>`, `<textarea>`, `<select>`, and
  at least one `role="combobox"` widget, confirm the scanner's output
  includes all of them (log/inspect the raw candidate list).
- **5.2** For a few known fields, confirm the extracted context (label,
  aria-label, placeholder, name/id) matches what's actually on the page.
- **5.3** Test with fields clearly labeled "Full Name", "Email", "Phone
  Number", "National ID", "LinkedIn URL" — confirm each is classified to
  the correct profile key without any AI call (verify via network
  inspector that no request fired for these).
- **5.4** Test with an ambiguous/unlabeled field or an open-ended question
  field — confirm an AI call is made with only the field's local context
  (not the whole page HTML) and returns a reasonable classification.
- **5.5** Test on a form containing a real `input[type=file]` and on a form
  with visible text like "attach your CV" near a text field — confirm both
  are marked `kind: "file-or-link"` and not treated as auto-fillable.
- **5.6** Confirm the final `DetectedField[]` array has one entry per
  candidate field with no duplicates and no missing fields compared to
  what's visibly on the test page.

### Phase 6 — Answer generation engine

- **6.1** Confirm profile-kind fields resolve instantly from storage with
  zero AI calls (check network inspector shows no request for these).
- **6.2** Ask the same open-ended question twice (same normalized text) in
  two different detect sessions — confirm the second time it's served from
  the answer bank, not regenerated (check via network inspector: no AI call
  on the second occurrence).
- **6.3** Ask a genuinely new open-ended question — confirm an AI call is
  made and the prompt sent includes CV context and the `defaultStyle`
  value (inspect the outgoing request body).
- **6.4** After 6.3, confirm the new Q&A pair now exists in the answer bank
  in storage.
- **6.5** In the panel, provide a custom rewrite instruction for one
  question — confirm the regenerated answer reflects that instruction
  (e.g. asking for "much shorter" measurably reduces length) and the
  updated answer + instruction are saved to the bank.

### Phase 7 — Answer bank

- **7.1** Directly call `upsertAnswerBankEntry` with a new entry and confirm
  it's retrievable via `getAnswerBank`.
- **7.2** Test the normalized match with two differently-punctuated/
  capitalized versions of the same question ("Why do you want this role?"
  vs "why do you want this role") — confirm both match the same entry.
- **7.3** In the panel, confirm any field served from the bank visibly shows
  a "reused" indicator and a rewrite control.
- **7.4** Use the rewrite control, save a new answer for that exact
  question, then trigger detection again on a form with the same question
  — confirm the new answer is now served instead of the old one.
- **7.5** Open the options page's answer-bank view — confirm all saved
  entries are listed, and editing/deleting one there is reflected the next
  time that question is detected.

### Phase 8 — Floating review panel UI

- **8.1** Confirm the panel lists every field from Phase 5's detection
  output with the correct label, proposed answer, and a status tag.
- **8.2** For one of each type of field, exercise every control (accept,
  manual edit, rewrite, skip, "I'll do this myself") and confirm each
  changes that field's state as expected without affecting other fields.
- **8.3** Confirm flagged file/link items appear in their own clearly
  separated section with readable guidance text, and clicking one
  highlights/scrolls to the corresponding element on the page.
- **8.4** Click "Fill form" — confirm every accepted field's value actually
  appears in the corresponding DOM element on the real page (not just in
  the panel's internal state).
- **8.5** After filling, manually change a field's value again from the
  panel — confirm it updates the page live. Click close — confirm the
  panel and floating button are both removed from the page.

### Phase 9 — Fill engine

- **9.1** Fill a standard `<input>` and `<textarea>` — confirm the page's
  own JS (e.g. a React-controlled form) recognizes the value (no
  "field appears empty to the site" bug — check by looking at whether a
  submit button that was disabled/validation-gated becomes enabled).
- **9.2** Fill a `<select>` — confirm the correct option is selected and
  the page registers the change the same way.
- **9.3** Test on a custom combobox widget — confirm either it fills
  correctly or the panel clearly reports it couldn't be auto-filled,
  never a silent no-op.
- **9.4** Confirm each filled field is visibly scrolled to/highlighted
  briefly during the fill sequence.

### Phase 10 — Polish and edge cases

- **10.1** Test on a Google Form/MS Form where content loads asynchronously
  — confirm clicking "Detect Form" immediately after page load still finds
  all fields (not just the ones present at the exact moment of click).
- **10.2** Test on a form embedded in an iframe — confirm same-origin
  iframes are scanned, and cross-origin ones produce a clear "can't access
  this embedded form" message rather than an empty/broken result.
- **10.3** Simulate an AI request failure (e.g. temporarily invalid key) —
  confirm the panel shows a clear error for that field rather than hanging
  or crashing the whole detection.
- **10.4** Confirm the summary line at the top of the panel accurately
  reflects the real counts (auto-filled / needing input) for the current
  page.

### Phase 11 — Manual testing pass

Local harness pages are provided in `test-pages/` (see `test-pages/README.md`)
so every procedure below can be run without needing live forms. Load the
unpacked extension, enable "Allow access to file URLs" on the extension card
(or serve `test-pages/` over HTTP), then run through each scenario.

- **11.1** Full run-through: onboarding done → detect → review panel accuracy
  → fill → submit-readiness. Use `test-pages/11.1-google-forms.html` first,
  then repeat on a real Google Form if available (don't submit a real
  application unless it's a test form).
- **11.2** Same full run-through on Microsoft Forms. Use
  `test-pages/11.2-ms-forms.html` first, then a real MS Form. If the real
  form is iframe-embedded, also check `test-pages/10.2-iframe-embedded.html`
  behavior (same-origin fields detected, cross-origin notice shown).
- **11.3** Same full run-through on Wuzzuf. Use
  `test-pages/11.3-wuzzuf-arabic.html` (Arabic labels + RTL page) to verify
  the bilingual keyword maps and RTL-safe panel, then test a real Wuzzuf
  application. Note any misclassified field and confirm a keyword-list fix
  resolves it.
- **11.4** Full run-through on a form outside all three platforms — use
  `test-pages/11.4-generic.html` (plain careers-page markup) and confirm no
  platform-specific assumption fails.
- **11.5** Across two separate detect sessions on two different forms with
  the same recurring question, confirm reuse-then-rewrite per 7.4. Use the
  pair `test-pages/11.5a-recurring-question.html` and
  `test-pages/11.5b-recurring-question.html` (identical "Why do you want to
  work here?" question).
- **11.6** (human) Onboard with a deliberately sparse/short CV and confirm
  AI answers don't invent employers/titles/dates absent from the source.
- **11.7** (human) Repeat 11.1 using only the NVIDIA free-tier path with
  your own free `build.nvidia.com` key — full detect → generate → fill
  completes with no paid key involved.

### Phase 12 — Privacy and store readiness

- **12.1** Have someone unfamiliar with the project read the privacy policy
  and confirm they can correctly state, in their own words, what's stored
  locally vs sent to the AI provider.
- **12.2** Cross-check each permission justification text actually matches
  what that permission is used for in the code.
- **12.3** Confirm all listing assets (icon, screenshots, descriptions) are
  present and screenshots reflect the actual current UI, not an outdated
  version.
- **12.4** Confirm the developer account registration completed
  successfully and the trader/non-trader declaration was submitted.

### Phase 13 — Publish

- **13.1** Confirm the production zip builds without dev-only code/console
  logs and matches the store's file-size/format requirements.
- **13.2** Confirm the dashboard listing shows all required fields filled
  in, including a working privacy policy link.
- **13.3** Track review status; if rejected, log the exact reason and fix
  before resubmitting.
- **13.4** On a completely clean Chrome profile, install the published
  extension and run through install → onboarding → detect → fill once,
  start to finish, with no dev environment involved.
