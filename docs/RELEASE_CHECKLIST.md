# Release Checklist

This checklist is completed against the exact commit that will receive the tag. A local pass is necessary but does not replace the GitHub Actions, tag, asset, and Pages checks.

## 1. Identity and scope

- [ ] `gh auth status` identifies the intended GitHub account.
- [ ] `gh api user --jq '.login, .id, .email'` matches the local author configuration.
- [ ] `git config --local --get user.name` and `git config --local --get user.email` use that account or its GitHub no-reply address.
- [ ] `git log --format='%an <%ae> | %cn <%ce>' | sort -u` contains only the authenticated account.
- [ ] `git log --format='%B'` contains no `Co-authored-by` trailer.
- [ ] The repository is `formstorm-lab`, default branch is `main`, and no other local repository was modified.
- [ ] The public repository scan and differentiation notes are current in `docs/COMPETITOR_SCAN.md`.

## 2. Version and documentation

- [ ] `package.json`, `package-lock.json`, and `src/core/version.ts` all state `0.1.0`.
- [ ] `CHANGELOG.md` contains the `0.1.0` release and its date.
- [ ] Both README files state `v0.1.0` and their commands match the CLI.
- [ ] `docs/assets/formstorm-lab.png` was captured from the release commit's real workbench.
- [ ] Architecture, privacy, benchmark, contribution, security, and conduct documents match current behavior.
- [ ] Public documentation makes no uniqueness claim and does not imply that allowlisting is authorization.

## 3. Clean installation and browser

Run from a clean clone using Node.js 22:

```bash
npm ci
npx playwright install chromium
```

- [ ] The lockfile is unchanged after installation.
- [ ] The installed Chromium revision matches the pinned Playwright package.
- [ ] No external fixture API, credential, or private user data is required.

## 4. Quality gates

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
```

- [ ] Unit tests cover core parsing, rules, generation, classification, minimization, and error branches.
- [ ] Integration tests use real local files and the loopback fixture server.
- [ ] At least three end-to-end user paths pass.
- [ ] Web keyboard operation, narrow viewport, and automated accessibility tests pass.
- [ ] Core line coverage is at least 80 percent and critical modules are reviewed against the 90 percent target.
- [ ] Fixed seeds and injectable report time are used where applicable.
- [ ] No test was weakened, skipped, or converted to a silent success to pass the gate.

The cross-platform aggregate is:

```bash
npm run verify
```

## 5. Product acceptance

```bash
npm run demo
```

- [ ] Registration produces its schema to DOM mismatch and accessibility finding.
- [ ] Checkout produces its schema to DOM mismatch and accessibility finding.
- [ ] Multilingual profile produces its schema to DOM mismatch and accessibility finding.
- [ ] Every fixture reports its deterministic expected business rejection.
- [ ] Expected rejection count is separate from runtime errors.
- [ ] Failure evidence includes a minimal input where minimization applies and a replay command.
- [ ] `report.json`, `report.html`, `report.junit.xml`, `scan.png`, and `trace.zip` exist for every fixture.
- [ ] `reports/demo/summary.json` references the generated synthetic evidence.
- [ ] Benchmark environment, workload, counts, and measured results follow `docs/BENCHMARK.md`.

## 6. Privacy and security

```bash
npm run scan:secrets
```

- [ ] Exact-origin enforcement rejects an unlisted target.
- [ ] Cross-origin subresources and state-changing HTTP methods are blocked and recorded.
- [ ] JSON, HTML, and JUnit redact tested sensitive patterns.
- [ ] Screenshot and trace were manually reviewed as raw evidence.
- [ ] Release inputs contain only synthetic fixture data.
- [ ] Dependency audit and repository secret scan pass in GitHub Actions.

## 7. Package and smoke test

```bash
npm run package
```

- [ ] `dist-release/formstorm-lab-0.1.0-node-any.tgz` exists.
- [ ] `dist-release/formstorm-lab-0.1.0-cli-node-any.zip` exists.
- [ ] `dist-release/formstorm-lab-0.1.0-fixture-app.zip` exists.
- [ ] `dist-release/formstorm-lab-0.1.0-playwright-evidence.zip` exists.
- [ ] The tarball was installed in a clean temporary directory and its version entry point ran.
- [ ] `dist-release/SHA256SUMS.txt` has one matching SHA-256 entry for each asset.
- [ ] Archive inspection finds no environment file, credential, cache, private database, or unrelated build output.

## 8. Automated release gate

After packaging, commit all intended release changes. The automated check requires a clean tree:

```bash
npm run release-check
```

It verifies the clean worktree, version agreement, changelog and README version, full quality gate, secret scan, unfinished-marker scan, author and committer identity, absence of co-author trailers, asset count, and every SHA-256 digest.

- [ ] `npm run release-check` passes without a bypass.
- [ ] `make verify`, `make demo`, `make package`, and `make release-check` pass where Make is available.
- [ ] Equivalent npm tasks pass on a platform without Make.

## 9. GitHub and Pages

- [ ] The public repository description and topics are set.
- [ ] `main` points at the intended release commit.
- [ ] CI, security, and Pages workflow runs for that commit are green.
- [ ] The Pages deployment contains only the synthetic workbench, schemas, and sample report.
- [ ] The Pages URL loads over HTTPS and its screenshot matches the documented interface.
- [ ] GitHub contributor and commit views show the authenticated account only.

Inspect the runs:

```bash
gh run list --branch main --limit 10
gh run watch RUN_ID --exit-status
```

## 10. Tag and Release

Only after sections 1 through 9 pass:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 dist-release/* --verify-tag --title "v0.1.0" --generate-notes
```

- [ ] The annotated tag and remote `main` resolve to the expected commit.
- [ ] The Release is public, not a draft, and not a prerelease.
- [ ] Every local release asset is present remotely with the same name and size.
- [ ] Downloaded assets match `SHA256SUMS.txt`.
- [ ] Tag-triggered release workflow is green.
- [ ] Repository URL, Pages URL, Release URL, SHAs, tests, coverage, CI run, asset hashes, identity result, differentiation, limitations, and next milestone are captured for the delivery report.

Verify the remote object:

```bash
gh release view v0.1.0 --json tagName,isDraft,isPrerelease,url,assets
git ls-remote origin refs/heads/main refs/tags/v0.1.0 refs/tags/v0.1.0^{}
```
