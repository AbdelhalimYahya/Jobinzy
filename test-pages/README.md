# Jobinzy manual-test harnesses

Static HTML pages that mimic real job-application form structures, so you can
exercise the extension end-to-end without needing live Google Forms / Microsoft
Forms / Wuzzuf accounts or public URLs. They are **not** part of the built
extension.

## How to use

1. Build and load the extension unpacked from `dist/`
   (`npm run build` → `chrome://extensions` → Developer mode → "Load unpacked").
2. Enable **"Allow access to file URLs"** on the extension card so the content
   script can be injected on `file://` pages (or serve this folder with a
   static server, e.g. `npx serve test-pages`).
3. Open a harness page, complete onboarding once (first run), then click the
   toolbar icon → **Detect Form** and work through the review panel.

> Jobinzy never submits forms — after filling, review and click the page's
> real submit button yourself (these pages don't send data anywhere).

## Pages → plan/test phases

| File | Exercises |
| --- | --- |
| `10.1-async-rendered.html` | Phase 10.1 — fields appear ~1.2s after load; click Detect Form immediately and confirm all fields are still found. |
| `10.2-iframe-embedded.html` | Phase 10.2 — same-origin iframe fields detected; cross-origin iframe shows the "can't read embedded form" notice. |
| `11.1-google-forms.html` | Phase 11.1 — Google Forms-style structure (labels, textarea, select, radios, file input). |
| `11.2-ms-forms.html` | Phase 11.2 — Microsoft Forms-style structure. |
| `11.3-wuzzuf-arabic.html` | Phase 11.3 — Wuzzuf-style **Arabic labels + RTL** page (validates bilingual keyword maps and RTL-safe layout). |
| `11.4-generic.html` | Phase 11.4 — generic careers page with no platform-specific structure. |
| `11.5a-recurring-question.html` + `11.5b-recurring-question.html` | Phase 11.5 — identical "Why do you want to work here?" question on two pages; verify bank reuse then per-form rewrite (7.4). After rewriting on B, re-run detection on 11.5a (a "third" session) to confirm the rewritten answer is now served from the bank. |

## Expected behaviors worth knowing before you test

- Radio/checkbox rows (e.g. the work-permit question on 11.1) are detected
  but appear as **"needs your input"** — that's correct: Jobinzy only
  auto-fills text-like fields and never picks a choice for you.
- On 11.4, a plain "Mobile" label may not match the phone keyword list and
  stay as needs-input — an unclassified field on a foreign page is expected
  behavior, not a detection bug (that's what the AI fallback + manual
  entry are for).
- File inputs and link-request fields are flagged with guidance text and
  never auto-attached (design decision, plan §2).

## Human-required checks (cannot be automated)

- Real Google Form / MS Form / Wuzzuf runs (Phases 11.1–11.3 on the live
  sites) — needs your accounts and a real form.
- Low-quality CV stress test (11.6) — feed a sparse one-page CV through
  onboarding and confirm AI answers don't invent employers/titles.
- Free-tier NVIDIA end-to-end (11.7) — needs your free `build.nvidia.com` API
  key configured in Settings → AI.
