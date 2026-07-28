# Privacy and Security

FormStorm Lab is local-first and deny-by-default. Its controls reduce accidental access and mutation, but they do not replace permission, a test plan, or artifact review.

## Authorized use

Only scan a form that you own or are explicitly authorized to assess. An entry in `--allow-origin` is not proof of consent. Do not point the tool at production accounts, payment flows, medical records, employee records, or other sensitive systems merely because the URL is reachable.

The safest default is:

```bash
npm run demo
```

That command uses only original synthetic fixtures committed under this repository's MIT license.

## Network boundary

`scan` requires an explicit target and at least one exact HTTP or HTTPS origin.

- The target's normalized origin must exactly equal an allowlist entry.
- Origin matching includes scheme, hostname, and port.
- Paths, hostname suffixes, wildcards, and redirect trust are not inferred.
- Every HTTP request, including redirects and subresources, passes through the Playwright route policy.
- Requests to an origin not listed are aborted and recorded.
- Only GET, HEAD, and OPTIONS are allowed.
- POST, PUT, PATCH, DELETE, and other state-changing HTTP methods are aborted and recorded.
- Service workers are disabled so they cannot create a second request path outside the visible browser context.

A page that depends on assets from another origin may render incompletely unless that exact origin is separately allowed. Adding it also expands the read boundary and requires the same authorization review.

This policy prevents FormStorm Lab from sending normal form submissions to a server. The bundled fixture applications calculate their synthetic accepted or rejected result in page JavaScript.

## Browser isolation

Each scan creates a new Playwright browser context with no imported user profile or storage state. FormStorm Lab does not ask for:

- Existing cookies.
- Saved authentication state.
- Password manager data.
- Browser extensions.
- Persistent local storage.
- A user's interactive Chrome profile.

The tested page still executes its own JavaScript in Chromium. Use a dedicated test environment and synthetic accounts for any authorized non-local scan.

## Data the tool processes

Depending on the command, FormStorm Lab can process:

- A local JSON Schema and fixture profile.
- Form metadata, labels, selectors, and constraints from the page DOM.
- Synthetic values generated from the fixed seed.
- Native validation messages and fixture status text.
- axe-core rule output, including selected HTML snippets and targets.
- Browser page errors, URLs, and policy block events.
- A full-page screenshot and Playwright trace.

The tool does not intentionally collect existing form field values. It fills controls with generated or fixture-profile values. It does not upload artifacts to a service.

## Redaction

Before JSON, HTML, or JUnit serialization, report values are recursively redacted when:

- A key resembles an API key, authorization value, cookie, credential, password, secret, or token.
- A string contains a common bearer token, GitHub token, or `sk-` token pattern.

This is defense in depth, not a complete data loss prevention system. Product-specific identifiers, names, free-form text, unusual secret formats, DOM HTML, error messages, and URLs can remain recognizable.

`scan.png` and `trace.zip` are raw browser evidence. They do not pass through report redaction and may contain rendered page content, source snapshots, and network details. Treat them as sensitive until reviewed.

## File handling

- Schemas and profiles are read from local paths supplied by the user.
- External and remote JSON Schema references are not loaded.
- Generated file boundary cases use an in-memory Playwright payload.
- Path separators in generated upload names are replaced before the payload reaches the file input.
- Browser artifacts are written inside the requested output directory.
- Demo, test, coverage, and release output directories are ignored by Git.
- Release packaging includes only committed synthetic fixtures and synthetic demo evidence.

Review `git status --short` and the release archive contents before publishing.

## Replay boundary

`replay` reads a JSON report and accepts only the fields needed to rerun a scan: allowlist, schema path, seed, and target. It does not execute a shell command embedded in the report.

Replay is still a browser action. Inspect an untrusted report before using it because its allowed target and local schema path determine what the rerun reads. The same exact-origin and HTTP method policy is applied again.

## Threat model

The `v0.1.0` controls are designed for accidental target drift, unintended HTTP mutation, common secret leakage in text reports, unsafe reuse of personal browser state, and non-deterministic external demo data.

The following are outside the security guarantee:

- A malicious page exploiting Chromium, Playwright, Node.js, or the host operating system.
- Data visible in raw screenshots or traces.
- DNS rebinding or a compromised host behind an explicitly authorized origin.
- Side effects caused by a GET endpoint that violates HTTP semantics.
- Product-specific secrets that do not match redaction rules.
- Malicious local schema, profile, or report files supplied by an untrusted party.
- Authorization, legal compliance, rate limiting, and production change management.

Run untrusted targets in an isolated machine or container with no valuable credentials or network access.

## Recommended workflow

1. Begin with the committed fixtures and a fixed seed.
2. Obtain written authorization for the exact test origin.
3. Use a dedicated non-production environment and synthetic account.
4. Allow the minimum set of origins.
5. Inspect security block events and unexpected browser messages.
6. Review JSON, HTML, JUnit, PNG, and trace separately.
7. Delete sensitive local evidence according to your organization's retention policy.
8. Share only a synthetic reduction whenever possible.

## Dependency and release controls

- Dependencies are pinned in `package-lock.json`.
- CI uses `npm ci`.
- The security workflow runs dependency audit and the repository secret scanner with minimal workflow permissions.
- Release packaging installs the tarball in a clean temporary directory and runs its version entry point.
- Every release asset is covered by `dist-release/SHA256SUMS.txt`.

Consumers should verify the checksum and inspect release provenance before installation.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for `KanadeK/formstorm-lab`. Do not include a real secret in the report. Use a synthetic token-shaped value, a reduced fixture, and redacted logs where possible.

For handling expectations and supported versions, see the repository [Security Policy](../SECURITY.md).
