# Security Policy

## Supported versions

Security fixes are provided for the latest `0.1.x` release. Users should reproduce a report against the newest patch version before filing when it is safe to do so.

| Version                            | Supported |
| ---------------------------------- | --------- |
| Latest `0.1.x`                     | Yes       |
| Older commits and unreleased forks | No        |

## Report privately

Use GitHub private vulnerability reporting in the `KanadeK/formstorm-lab` repository. Do not open a public issue for a vulnerability that could expose a credential, private form value, sensitive URL, raw trace, or a practical bypass of the request policy.

Include:

- A concise impact statement.
- Affected version and commit SHA.
- Operating system, Node.js, Playwright, and Chromium versions.
- Synthetic reproduction steps.
- The exact origin and method policy behavior you expected.
- A redacted report or minimal test when safe.
- Any temporary mitigation you confirmed.

Use synthetic token-shaped values rather than a real secret. Do not test a third-party system to demonstrate the report.

## Scope

Security-sensitive project behavior includes:

- Exact-origin target validation.
- Redirect and subresource enforcement.
- Blocking state-changing HTTP methods.
- Ephemeral browser contexts and service worker blocking.
- Artifact path confinement.
- Report escaping and redaction.
- Replay report validation.
- Release archive contents and checksums.
- Dependency and GitHub Actions integrity.

Raw Playwright screenshots and traces are documented as sensitive artifacts. The presence of page data in those raw files is not itself a vulnerability unless the tool represents them as redacted or publishes them outside the requested local workflow.

## Coordinated handling

The maintainer will assess reproducibility, severity, affected versions, and a safe disclosure plan through the private report. Public disclosure should wait until a fix or practical mitigation is available and release users have enough information to update.

Do not request or publish another user's private evidence. If a report was accidentally opened publicly, remove exposed secrets at their source and rotate them before continuing.

## Project boundary

FormStorm Lab is a QA tool for systems you own or are authorized to test. Its allowlist reduces accidental target drift but does not grant permission. GET endpoints can have side effects on a broken application, and a malicious page can still attack the browser or host through an upstream vulnerability.

Use a dedicated test environment, synthetic account, minimum origin set, and isolated host for non-local work. Review [Privacy and security](docs/PRIVACY_AND_SECURITY.md) before running a scan or sharing evidence.

## Public reliability reports

Crashes, false positives, unsupported schema input, performance regressions, and documentation errors without security impact can use a normal GitHub issue. Attach only synthetic, redacted evidence.
