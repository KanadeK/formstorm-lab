# Architecture

FormStorm Lab separates deterministic form reasoning from browser and file system effects. The same core powers the Node package and the static workbench, while Playwright execution stays behind the CLI.

## System flow

```text
                   local JSON Schema
                           |
                           v
                extraction + diagnostics
                           |
                           v
                      FormModel
                     /         \
                    v           v
          seeded generation   schema oracle
                    \           /
                     v         v
                       TestCase
                           |
allowed target URL -> Playwright context -> DOM extraction
          |                |                    |
          v                v                    v
 request policy       boundary run       schema/DOM merge
                           |                    |
                           v                    v
                 outcome classification     findings
                           |
                           v
                       minimizer
                           |
                           +------> axe-core findings
                                      |
                                      v
                         JSON / HTML / JUnit / PNG / trace
```

The request policy is installed before navigation. The browser never receives an unverified target first and gets checked later.

## Module boundaries

### `src/core`

The core has no browser, file system, or network dependency.

- `models.ts` defines Zod-validated domain contracts.
- `schema.ts` extracts the supported JSON Schema subset, constraint provenance, and structured diagnostics.
- `generate.ts` creates deterministic boundary cases from a `FormModel` and fixed seed.
- `oracle.ts` validates assignments against the source schema.
- `outcome.ts` distinguishes pass, expected rejection, unexpected acceptance, unexpected rejection, runtime crash, timeout, and observation.
- `minimize.ts` reduces a failing assignment while preserving its failure signature and respecting an attempt limit.
- `policy.ts` validates exact-origin targets for browser-independent callers.
- `redact.ts` protects sensitive field names and token-shaped strings in core report values.

The package root exports this layer from `dist/node/index.js` with declarations in `dist/node/index.d.ts`.

### `src/adapters`

Adapters own external effects.

- `file-schema.ts` reads and validates local schema and fixture profile files.
- `fixture-server.ts` serves committed synthetic fixture files over a loopback HTTP origin.
- `dom-form.ts` extracts native forms, controls, labels, selectors, and HTML constraints.
- `schema-dom-merge.ts` matches fields by name and records schema to DOM disagreements.
- `browser-runner.ts` applies the request policy, launches Chromium, runs boundary and business cases, invokes axe-core, classifies outcomes, minimizes failures, and coordinates evidence.
- `artifact-store.ts` constrains artifact writes to the requested output directory.

Adapters consume the core through public core types and functions. The core does not import adapters.

### `src/reporters`

Reporters turn an in-memory browser result into:

- Redacted JSON for automation and replay.
- Escaped standalone HTML for human review.
- JUnit XML for CI.

Redaction happens before serialization. Screenshot and Playwright trace creation is owned by the browser adapter and cannot be treated as redacted.

### `src/commands`

The CLI is the composition root:

- `extract` connects a local file to schema extraction.
- `generate` connects extraction, the oracle, and boundary generation.
- `scan` connects a local schema and exact-origin target to Playwright.
- `replay` reuses target, schema path, allowlist, and seed from a prior JSON report.
- `demo` starts the loopback fixture server and verifies all three fixture applications.

The CLI reports invalid arguments and failed policy checks with a nonzero exit code rather than writing a success result.

### `src/web`

The Vite workbench reuses `src/core` only. It can parse an example or uploaded JSON Schema, inspect constraints, generate cases, download case JSON, and inspect committed synthetic findings. It cannot import Node adapters or open a Playwright browser.

This is an intentional capability boundary for static hosting.

## Domain contracts

### Form model

A `FormModel` has version `0.1.0` and one or more unique fields. Each field records:

- Stable `id` and `name`.
- Human label.
- Kind: text, email, number, date, file, or select.
- Required state.
- Normalized constraints.
- Select options when applicable.
- Constraint provenance with source path and keyword.

Zod rejects duplicate fields, invalid constraint ranges, and inconsistent select models at the boundary.

### Test case

A `TestCase` contains:

- A deterministic ID and unsigned 32-bit seed.
- The field, boundary dimension, and named variant.
- A complete form assignment.
- `accept`, `reject`, or `observe` expectation.
- Provenance for the constraint that motivated it.

The schema oracle assigns expectations from the original schema. Browser behavior is observed independently.

### Outcome

Observed outcomes are one of:

- `accepted`
- `rejected`, including native validation messages
- `runtime-crash`
- `timeout`

Classification compares the expectation with the observation. An expected business rejection is therefore not interchangeable with a JavaScript error.

### Browser report

The browser report uses schema version `1`. It records:

- Version, generated time, seed, target, and normalized allowlist.
- Extracted DOM forms.
- Schema to DOM, accessibility, runtime, and security findings.
- Boundary results with expectation, observation, classification, duration, replay command, and minimal input where applicable.
- Fixture business outcomes.
- Summary counts and artifact references.

The serialized JSON is the source for `replay`. Consumers should check `schemaVersion` before relying on fields.

## Supported schema scope

The `v0.1.0` parser accepts a root object whose direct properties are scalar controls.

Supported:

- String, number, integer, boolean, enum, and const fields.
- Email, date, and binary string formats.
- Required, min/max length, pattern, min/max numeric value, exclusive numeric limits, multiple-of, date format limits, defaults, and examples.
- Nullable scalar type arrays with one concrete type.
- Non-recursive local JSON Pointer references.

Explicitly outside this version:

- Nested object and array fields.
- `allOf`, `anyOf`, `oneOf`, `not`, conditionals, and dependent schemas.
- Recursive references.
- External references and remote schema loading.

Extraction can stop on unsupported input or retain supported fields and return diagnostics, depending on the caller's mode.

## Determinism

Determinism is scoped to inputs the project controls:

- Every random case uses a caller-provided seed.
- Field traversal and diagnostics are sorted.
- The fixture server uses committed files only.
- Fixture business outcomes are declared in committed profiles.
- Report time can be injected in integration tests.
- Failure reduction has a fixed maximum attempt count.

Absolute paths, timestamps, duration measurements, Chromium behavior, operating system validation messages, and axe-core output can differ across environments. Release comparisons therefore use Node.js 22, the lockfile, and the Playwright browser version selected by the lockfile.

## Browser policy

`scan` accepts exact origins, not path prefixes or hostname patterns.

1. Parse every allowlist entry and the target as HTTP or HTTPS.
2. Normalize each entry to its URL origin.
3. Refuse navigation if the target origin is absent.
4. Install a Playwright route before opening the page.
5. Allow HTTP GET, HEAD, and OPTIONS only when the request origin is listed.
6. Abort other origins and state-changing HTTP methods.
7. Record each policy block in the report.

Non-HTTP browser-internal resources are allowed so Chromium can operate. Service workers are disabled to keep requests inside the visible context policy.

## Failure minimization

The runner minimizes only classifications treated as failures and does not minimize runtime crashes. It:

1. Captures the original failure signature.
2. Tries smaller assignments within the attempt budget.
3. Re-executes each candidate through the same page observer.
4. Retains a candidate only when the classification and signature are preserved.

The report records the resulting `minimalInput`. Minimization is evidence reduction, not proof of a globally smallest input.

## Artifact lifecycle

The caller selects an output directory. A scan creates:

```text
output/
  report.json
  report.html
  report.junit.xml
  scan.png
  trace.zip
```

JSON and HTML are redacted by the reporter. JUnit contains finding descriptions suitable for CI. PNG and trace are raw browser evidence and need separate review. Release packaging gathers only the synthetic demo evidence, not arbitrary user scan directories.

## Extending the project

### Add a boundary dimension

1. Add the dimension to the Zod enum and TypeScript union.
2. Implement seeded variants without reading environment state.
3. Define oracle behavior and provenance.
4. Add unit tests for accepted, rejected, and edge values.
5. Expose the dimension in CLI parsing and the workbench when it is browser-safe.

### Add a schema keyword

1. Normalize it into the field constraint model.
2. Preserve its exact source path and keyword.
3. Teach the oracle how it affects expectation.
4. Add invalid-schema and supported-schema tests.
5. Add DOM comparison only when HTML has an equivalent constraint.

### Add a browser

1. Preserve the exact-origin route policy.
2. Match artifact shape and outcome semantics.
3. Add integration and end-to-end coverage on a pinned browser version.
4. Document any platform-specific validation messages.

No extension may move network, file, or browser effects into `src/core`.
