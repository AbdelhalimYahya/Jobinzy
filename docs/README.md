# Jobinzy — PlantUML Documentation

Architecture and flow diagrams for the Jobinzy Chrome extension, generated
from the actual source in `src/`. Every diagram below is maintained by hand
to match the code — if you change a module's responsibilities, update the
matching diagram in the same PR.

## Rendering the diagrams

PlantUML `.puml` files are plain text; render them with any PlantUML tool:

| Tool | How |
| --- | --- |
| [plantuml.com online server](https://www.plantuml.com/plantuml) | Paste the file contents. |
| VS Code extension | Install *PlantUML* (jebbs) — open a `.puml` file, `Alt+D` to preview. |
| CLI | `plantuml docs/*.puml` (or `java -jar plantuml.jar docs/*.puml`) — outputs PNG/SVG next to each file. |
| GitHub Markdown | Use an inline PlantUML renderer, or export each diagram to an image and embed it in a `docs/*.md` page. |

## Diagram index

| File | Type | What it shows |
| --- | --- | --- |
| [`architecture.puml`](architecture.puml) | Component | The three runtime surfaces (background SW, content script, options page) + shared `lib/` modules and their dependencies. |
| [`data-model.puml`](data-model.puml) | Class | The full data model from `src/lib/types.ts`: `Profile`, `AnswerBankEntry`, `AISettings`, `DetectedField`, enums. |
| [`storage-layer.puml`](storage-layer.puml) | Component | `storage.ts` — the typed `chrome.storage.local` layer, keys, error contract, migrations. |
| [`ai-client.puml`](ai-client.puml) | Sequence | The single AI client: request construction, concurrency limiter (3.7), retry logic (10.3), error classification. |
| [`detection-flow.puml`](detection-flow.puml) | Activity | The Phase 5 detection pipeline: scan → context → rules → AI fallback → file/link flagging. |
| [`answer-resolution-flow.puml`](answer-resolution-flow.puml) | Sequence | How one open-ended field gets its answer: bank-first (6.2), AI generation (6.3), persistence (6.4), rewrite (6.5). |
| [`fill-engine-flow.puml`](fill-engine-flow.puml) | Activity | The Phase 9 fill engine: native setters, selects, custom widgets, skip handling, post-fill verification. |
| [`onboarding-flow.puml`](onboarding-flow.puml) | State | The onboarding wizard (2.1–2.9): steps, per-step persistence, resume strategy, edit mode. |
| [`content-script-lifecycle.puml`](content-script-lifecycle.puml) | Sequence | Toolbar click → injection → shadow DOM trigger → detect → panel → fill → close (Phases 4, 8, 9, 10). |
| [`deployment.puml`](deployment.puml) | Deployment | Dev build, store packaging, Chrome runtime topology, AI provider connection. |
| [`use-cases.puml`](use-cases.puml) | Use case | What a job seeker can do with Jobinzy, grouped by phase. |

## How the diagrams map to the plan phases

- Phases **0–3** (scaffolding, storage, onboarding, AI settings) →
  [`architecture.puml`](architecture.puml), [`data-model.puml`](data-model.puml),
  [`storage-layer.puml`](storage-layer.puml), [`ai-client.puml`](ai-client.puml),
  [`onboarding-flow.puml`](onboarding-flow.puml).
- Phases **4–5** (trigger, detection) →
  [`content-script-lifecycle.puml`](content-script-lifecycle.puml),
  [`detection-flow.puml`](detection-flow.puml).
- Phases **6–7** (answers, answer bank) →
  [`answer-resolution-flow.puml`](answer-resolution-flow.puml).
- Phases **8–10** (panel, fill engine, polish) →
  [`fill-engine-flow.puml`](fill-engine-flow.puml),
  [`content-script-lifecycle.puml`](content-script-lifecycle.puml).
- Phases **11–13** (store readiness) → [`deployment.puml`](deployment.puml),
  [`use-cases.puml`](use-cases.puml).

## Conventions used in the diagrams

- **Green** components = extension surfaces (background SW, content script,
  options page). **Blue** = shared `lib/` modules. **Orange** = external
  systems (`chrome.storage.local`, the AI provider).
- Sequence diagrams use `alt/else` blocks for the resilience paths
  (bank hit vs generate, success vs failure) — those branches are real code
  paths, not decoration.
- Numbers like `(3.7)` reference the task numbers in `plan.md` so you can
  jump from a diagram straight to the spec.
