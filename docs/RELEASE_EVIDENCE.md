# v0.1.0 Release Evidence

This record captures the local release-candidate gates completed on 2026-07-28.
The immutable final commit SHA, GitHub Actions runs, Pages deployment, remote
asset metadata, and downloaded checksum verification are recorded by the public
GitHub release.

## Environment

| Item                  | Value                                           |
| --------------------- | ----------------------------------------------- |
| Host                  | Windows `10.0.26200`, `win32-x64`               |
| CPU / memory          | Intel Core i9-14900HX, 32 logical CPUs / 32 GiB |
| Local Node.js / npm   | `v24.18.0` / `11.16.0`                          |
| Supported CI runtime  | Node.js 22                                      |
| Playwright / Chromium | `1.61.1` / `149.0.7827.55`                      |
| Seed                  | `4501`                                          |

## Quality gate

`npm run verify` completed without a bypass:

- 32 of 32 unit and integration tests passed.
- Statement coverage: 88.87 percent (551/620).
- Branch coverage: 81.44 percent (439/539).
- Function coverage: 94.56 percent (87/92).
- Line coverage: 89.22 percent (530/594).
- 4 of 4 Playwright end-to-end tests passed, covering keyboard operation,
  generated JSON download, narrow layout, and an axe-core scan with no
  automatically detectable workbench violations.
- Formatting, ESLint, TypeScript, Node and Web builds, and the tracked-file
  secret scan passed.
- The official npm registry audit reported 0 vulnerabilities after the locked
  dependency upgrades.

## Fixture acceptance

`npm run demo` completed all three synthetic fixtures:

| Fixture              | Boundary cases | Findings | Accessibility | Validation mismatches | Expected rejections | Runtime errors |
| -------------------- | -------------: | -------: | ------------: | --------------------: | ------------------: | -------------: |
| Registration         |             29 |       10 |             1 |                     9 |                  21 |              0 |
| Checkout             |             16 |        3 |             1 |                     2 |                  16 |              0 |
| Multilingual profile |             25 |        5 |             1 |                     4 |                   3 |              0 |
| **Total**            |         **70** |   **18** |         **3** |                **15** |              **40** |          **0** |

Every fixture produced a redacted JSON report, standalone HTML report, JUnit
report, portable schema copy, screenshot, Playwright trace, replay command, and
minimal failing assignment where minimization applied.

## Package acceptance

`npm run package` completed the fixture scan, browser end-to-end suite, Node and
Web builds, npm pack, four platform-labelled archives, and SHA-256 manifest. It
then installed the npm tarball into a fresh temporary project and returned
`0.1.0` from the packaged CLI.

The package task uses a repository-local ignored npm cache and the official npm
registry. This avoids depending on user-profile cache permissions while keeping
the clean-install smoke test representative.

## Reviewed boundaries

- Browser execution is Chromium-only in `v0.1.0`.
- Schema extraction covers direct scalar properties rather than the entire JSON
  Schema standard.
- The static Pages workbench cannot launch Playwright or scan a URL.
- Screenshots and traces are raw evidence and still require human privacy
  review before sharing.
