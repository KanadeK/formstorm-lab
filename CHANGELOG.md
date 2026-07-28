# Changelog

All notable changes to FormStorm Lab are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-28

### Added

- Zod-validated form, field, test case, outcome, finding, report, and replay contracts.
- JSON Schema extraction for direct scalar properties, local non-recursive references, normalized constraints, and source provenance.
- Seeded boundary generation for length, Unicode, RTL, whitespace, date, filename, email, number, and select dimensions.
- AJV-backed schema oracle, expected rejection classification, failure signatures, bounded minimization, and report redaction.
- Local schema and fixture profile adapters.
- Native HTML form and label extraction with schema to DOM constraint comparison.
- Exact-origin Playwright request policy that blocks unlisted origins and state-changing HTTP methods.
- Chromium execution with axe-core, deterministic fixture business cases, screenshots, traces, and minimal failure evidence.
- Redacted JSON, standalone HTML, and JUnit reporters.
- CLI commands for extraction, generation, scanning, replay, and the three-fixture demo.
- Browser-only schema workbench with case download and synthetic report filtering.
- Registration, checkout, and multilingual profile fixtures under the MIT license.
- Unit, integration, end-to-end, regression, privacy, and accessibility coverage.
- Reproducible benchmark protocol and bilingual user documentation.
- CI, security, Pages, release, dependency update, packaging, checksum, and clean-install verification workflows.

### Security

- Updated AJV to `8.20.0` and the ESLint/tsup build chain to fixed dependency
  versions; the release candidate reports zero npm audit findings.
- Browser contexts are ephemeral and do not import a user's saved profile or authentication state.
- Service workers are blocked in scan contexts.
- Report values with sensitive key names and common token patterns are redacted before JSON, HTML, or JUnit serialization.
- Synthetic upload values use in-memory payloads rather than creating boundary filenames on disk.

### Known limits

- Browser execution targets Chromium.
- The schema scope is direct scalar properties rather than the full JSON Schema standard.
- Screenshots and Playwright traces are raw evidence and require manual privacy review.
- Static Pages can generate schema cases and inspect synthetic reports but cannot run Playwright or scan a URL.

[0.1.0]: https://github.com/KanadeK/formstorm-lab/releases/tag/v0.1.0
