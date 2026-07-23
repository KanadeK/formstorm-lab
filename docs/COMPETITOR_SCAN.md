# Competitor and Naming Scan

_Last checked: 2026-07-23._

## Method

- GitHub authentication was verified as [`KanadeK`](https://github.com/KanadeK).
- `gh search repos "FormStorm Lab"` returned `[]`.
- `gh search repos "formstorm-lab in:name"` returned `[]`.
- `gh api repos/KanadeK/formstorm-lab` returned HTTP 404.
- Repository stars and update dates below come from GitHub repository metadata.
- Last update uses `pushed_at`, because metadata-only changes can alter `updated_at`.
- Active means not archived with a push on or after 2024-07-23.
- Approximate overlap compares five documented capabilities: form or schema discovery, boundary and internationalized input generation, accessibility analysis, browser execution evidence, and minimization or replay.

## Naming decision

Use **FormStorm Lab** and **`formstorm-lab`**. Exact-name and exact-slug searches found no repository, so the fallback name is not triggered. Several unrelated projects use the shorter `formstorm` stem, but none occupies the requested identity.

## Relevant public repositories

Star counts are a point-in-time snapshot from 2026-07-23.

| Repository                                                                                        |  Stars | Last push  | Primary function                                                         | Overlap with FormStorm Lab                                                                                                        | Approx. overlap | Active       |
| ------------------------------------------------------------------------------------------------- | -----: | ---------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------: | ------------ |
| [`netsquare/BrowserBruter`](https://github.com/netsquare/BrowserBruter)                           |    334 | 2025-09-11 | Browser-driven form security fuzzing and reports.                        | Browser form fuzzing and evidence, without schema-derived QA boundaries, axe, deterministic shrinking, or allowlist-first policy. |             50% | Yes          |
| [`schemathesis/schemathesis`](https://github.com/schemathesis/schemathesis)                       |  3,483 | 2026-07-22 | Generates edge and invalid API cases from OpenAPI and GraphQL schemas.   | Strong schema generation, shrinking, and replay overlap, but API-focused with no HTML form or accessibility evidence flow.        |             55% | Yes          |
| [`gojko/bugmagnet`](https://github.com/gojko/bugmagnet)                                           |    279 | 2025-11-06 | Browser extension for inserting problematic values into editable fields. | Related boundary catalog, but manual and without schema extraction, orchestration, axe, or replay artifacts.                      |             25% | Yes          |
| [`dubzzz/fast-check`](https://github.com/dubzzz/fast-check)                                       |  5,073 | 2026-07-23 | Property-based testing with seeded replay and shrinking.                 | Generation, shrinking, and replay primitives without form discovery or integrated browser evidence.                               |             30% | Yes          |
| [`json-schema-faker/json-schema-faker`](https://github.com/json-schema-faker/json-schema-faker)   |  3,444 | 2026-07-22 | Generates valid fake data from JSON Schema.                              | Schema parsing and deterministic data overlap, without adversarial boundaries, browser execution, or accessibility checks.        |             25% | Yes          |
| [`hannob/webformfuzzer`](https://github.com/hannob/webformfuzzer)                                 |      0 | 2024-09-18 | Minimal PHP-oriented web-form fuzzer.                                    | Direct form fuzzing, with no documented schema, axe, trace, shrinking, or structured evidence pipeline.                           |             15% | Sparse       |
| [`nbursa/form-fuzzer-ai`](https://github.com/nbursa/form-fuzzer-ai)                               |      0 | 2025-06-19 | Experimental work-in-progress form fuzzer.                               | Semantically adjacent, but its public documentation does not demonstrate functional parity.                                       |     10% or less | Experimental |
| [`microsoft/playwright`](https://github.com/microsoft/playwright)                                 | 93,321 | 2026-07-23 | Cross-browser web testing and automation.                                | Supplies browser execution, screenshots, and traces, but not schema-aware boundaries or accessibility orchestration.              |             25% | Yes          |
| [`dequelabs/axe-core`](https://github.com/dequelabs/axe-core)                                     |  7,331 | 2026-07-23 | Accessibility engine for automated Web UI testing.                       | Exact accessibility-engine overlap, without form fuzzing, minimization, or evidence orchestration.                                |             20% | Yes          |
| [`pa11y/pa11y`](https://github.com/pa11y/pa11y)                                                   |  4,480 | 2026-07-20 | Command-line automated accessibility testing.                            | Accessibility execution and reporting, without schema extraction, boundary generation, or minimal replay cases.                   |             20% | Yes          |
| [`faker-js/faker`](https://github.com/faker-js/faker)                                             | 15,423 | 2026-07-22 | Synthetic localized data for Node.js and browsers.                       | Useful for internationalized samples, but not validation boundaries, execution, or minimization.                                  |             15% | Yes          |
| [`rjsf-team/react-jsonschema-form`](https://github.com/rjsf-team/react-jsonschema-form)           | 15,836 | 2026-07-20 | Builds React forms from JSON Schema.                                     | Shares schema and form modeling, but generates UI rather than tests and evidence.                                                 |             15% | Yes          |
| [`microsoft/accessibility-insights-web`](https://github.com/microsoft/accessibility-insights-web) |    909 | 2026-07-21 | Browser extension for web accessibility assessment.                      | Browser accessibility overlap, without schema discovery, boundary generation, shrinking, or Playwright trace production.          |             20% | Yes          |

## Overlap gate

No reviewed active repository has more than approximately 70 percent documented overlap with the complete MVP. Schemathesis is API-oriented; BrowserBruter is security-payload-oriented. FormStorm Lab remains differentiated by combining deterministic form boundaries, internationalization, axe-core, allowlist-only browser execution, failure classification, shrinking, and replay evidence in one offline-capable QA workflow.
