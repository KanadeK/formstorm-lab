# Contributing

Thank you for improving FormStorm Lab. Contributions are most useful when they preserve deterministic behavior, the exact-origin safety boundary, and evidence that another developer can reproduce.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening an issue

- Search existing issues and the documented [FAQ](README.md#faq).
- Confirm the problem against the latest supported release or `main`.
- Reduce it to a synthetic schema or one of the committed fixtures.
- Remove credentials, private URLs, customer data, screenshots, and traces that cannot be shared.
- For security impact, stop and use the private process in [SECURITY.md](SECURITY.md).

A useful bug report includes:

- FormStorm Lab, Node.js, npm, Playwright, and Chromium versions.
- Operating system and architecture.
- Fixed seed.
- Synthetic schema or fixture name.
- Exact command and exit code.
- Expected and observed classification.
- Redacted report excerpt or a safe reproduction repository.

## Development setup

Use Node.js 22 or newer:

```bash
git clone https://github.com/KanadeK/formstorm-lab.git
cd formstorm-lab
npm ci
npx playwright install chromium
npm run verify
```

Run the workbench during UI changes:

```bash
npm run dev:web
```

Run the real synthetic browser workflow:

```bash
npm run demo
```

## Project boundaries

- `src/core` must stay deterministic and independent of browsers, files, and the network.
- `src/adapters` owns external effects and converts them into domain contracts.
- `src/reporters` must escape its output and apply report redaction.
- `src/commands` composes the CLI but should not duplicate domain rules.
- `src/web` may import the browser-safe core, not Node or Playwright adapters.
- Fixtures must be original synthetic data under the repository's MIT license.
- Tests must not rely on an unstable external API.

Read [Architecture](docs/ARCHITECTURE.md) and [Privacy and security](docs/PRIVACY_AND_SECURITY.md) before changing these boundaries.

## Making a change

1. Create a focused branch.
2. Write or update a test that captures the intended behavior.
3. Make the smallest coherent implementation change.
4. Update English and Chinese documentation when user-facing behavior changes.
5. Run the narrow test while iterating.
6. Run the complete gate before opening a pull request.

Do not weaken assertions, suppress an error, remove a test, disable strict type checking, or add a CI bypass to obtain a green result.

## Tests

Choose the layer that owns the behavior:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
```

- Unit tests cover parsing, normalization, generation, oracle decisions, classification, minimization, and redaction without I/O.
- Integration tests use temporary files, the loopback fixture server, and a real Playwright browser where needed.
- End-to-end tests start from a user entry point and assert meaningful state, exported content, keyboard behavior, responsive behavior, and accessibility.
- Regression tests preserve the smallest reproduction of a defect.

Use a fixed seed for random data. Inject time into report-producing code. Do not use a delay as synchronization when a state or event can be awaited.

Core source line coverage must remain at least 80 percent. Critical domain modules should remain at or above the project's 90 percent target where practical.

## Adding a fixture

A fixture contribution includes:

- `index.html` and local page script.
- JSON Schema.
- Deterministic profile defaults and business outcomes.
- At least one intentional schema to DOM validation disagreement.
- At least one intentional, documented accessibility issue.
- Integration assertions that find both issues.
- No external network dependency, tracking, personal data, or third-party asset.

The page must make accepted and rejected outcomes observable without sending a state-changing HTTP request.

## Formatting and verification

Format changed files:

```bash
npm run format
```

Run the complete gate:

```bash
npm run verify
```

Before release-related work, also run:

```bash
npm run demo
npm run package
npm run release-check
```

`release-check` expects a clean worktree and prebuilt release assets, so commit the intended release content before its final run.

## Commits

Use a concise imperative subject such as:

```text
fix: preserve expected rejection during minimization
test: cover cross-origin redirect blocking
docs: explain raw trace privacy
```

Keep unrelated changes separate. Do not add generated reports, coverage output, local environment files, browser caches, secrets, or personal test data.

## Pull requests

The pull request description should explain:

- User problem and chosen behavior.
- Modules and trust boundaries affected.
- Tests added or changed.
- Exact verification commands run.
- Privacy, accessibility, and compatibility impact.
- Screenshot from the real workbench when UI changed.

Maintainers may ask for a smaller scope or a synthetic reproduction before review. Review feedback should be resolved with code or a documented technical reason, not by silently weakening coverage.

## Documentation

User-facing behavior is documented in both `README.md` and `README.zh-CN.md`. Keep CLI names, flags, artifact paths, schema scope, and security limitations synchronized. Performance claims must follow `docs/BENCHMARK.md` and include the measured environment.

## License

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
