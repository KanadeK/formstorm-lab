# Benchmark Protocol

FormStorm Lab treats performance results as release evidence, not as a machine-independent speed promise. This document fixes the workload and collection method so another contributor can reproduce the measurement.

## Release workload

The sample workload is intentionally small and reviewable:

| Input                        |                                             Size |
| ---------------------------- | -----------------------------------------------: |
| Registration fixture         |                                  3 schema fields |
| Checkout fixture             |                                  3 schema fields |
| Multilingual profile fixture |                                  5 schema fields |
| Total                        |           3 local applications, 11 schema fields |
| Fixture business outcomes    |              3 deterministic expected rejections |
| Seed                         |                                           `4501` |
| Browser                      | Chromium version selected by `playwright@1.61.1` |

Each browser scan also performs DOM extraction, schema to DOM comparison, axe-core analysis, applicable boundary execution, bounded failure minimization, business-case execution, screenshot capture, trace capture, and report serialization.

## Environment record

Run the following from a clean clone before timing:

```bash
node --version
npm --version
npx playwright --version
node -e "const os=require('node:os'); console.log(JSON.stringify({platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpu:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1073741824)},null,2))"
git rev-parse HEAD
```

The tagged release record includes:

- Operating system and architecture.
- CPU model, logical CPU count, and installed memory.
- Node.js, npm, Playwright, and Chromium versions.
- Commit SHA.
- Whether the run used a cold browser cache.
- Median and slowest wall-clock result from the measured runs.
- Generated case, finding, expected rejection, and runtime error counts from `reports/demo/summary.json`.

The authoritative values are captured from the release commit's command output and summary file. They are not copied from a development run because code, browser binaries, and host load can change.

## Preparation

```bash
npm ci
npx playwright install chromium
npm run build
```

Close unrelated CPU-intensive applications. Keep the machine connected to power and use the same power mode for every run. The fixture server is loopback-only, so network speed is not part of the workload.

## Core generation measurement

Build once, then time this command:

```bash
node dist/node/cli.js generate --schema fixtures/multilingual-profile/schema.json --seed 4501 --dimensions length,unicode,rtl,whitespace,date,filename --out reports/benchmark/profile-cases.json
```

Run it once to warm the Node.js and file system path, then collect five wall-clock runs. Report the median and slowest run. Also record the number of cases in `reports/benchmark/profile-cases.json`.

On Linux or macOS:

```bash
/usr/bin/time -p node dist/node/cli.js generate --schema fixtures/multilingual-profile/schema.json --seed 4501 --dimensions length,unicode,rtl,whitespace,date,filename --out reports/benchmark/profile-cases.json
```

On Windows PowerShell:

```powershell
Measure-Command { node dist/node/cli.js generate --schema fixtures/multilingual-profile/schema.json --seed 4501 --dimensions length,unicode,rtl,whitespace,date,filename --out reports/benchmark/profile-cases.json }
```

## Browser demo measurement

`npm run demo` includes a build before the fixture scans. To measure the shipped top-level user path, retain that build in the timing:

```bash
npm run demo
```

Run one warm-up and three measured runs. Record median and slowest wall-clock duration. Keep the fixed seed and do not reuse a manually started fixture server.

On Linux or macOS:

```bash
/usr/bin/time -p npm run demo
```

On Windows PowerShell:

```powershell
Measure-Command { npm run demo }
```

After each measured run, retain these evidence fields from `reports/demo/summary.json`:

```text
seed
fixtures[].status
fixtures[].summary.boundaryCases
fixtures[].summary.findings
fixtures[].summary.accessibilityViolations
fixtures[].summary.validationMismatches
fixtures[].summary.expectedRejections
fixtures[].summary.runtimeErrors
totals
```

The run is invalid if the seed differs from `4501`, any fixture is missing, or a runtime error is present.

## v0.1.0 measured result

Measured on the release-preparation tree on 2026-07-28. The full acceptance
commands are rerun at the final release commit; the GitHub Release records that
immutable SHA. The browser cache was warm before the three measured demo runs.

| Environment           | Value                                  |
| --------------------- | -------------------------------------- |
| OS                    | Windows `10.0.26200`, `win32-x64`      |
| CPU                   | Intel Core i9-14900HX, 32 logical CPUs |
| Memory                | 32 GiB                                 |
| Node.js / npm         | `v24.18.0` / `11.16.0`                 |
| Supported CI runtime  | Node.js 22                             |
| Playwright / Chromium | `1.61.1` / `149.0.7827.55`             |

| Workload                   | Samples |  Median | Slowest | Output            |
| -------------------------- | ------: | ------: | ------: | ----------------- |
| Core generation            |       5 |  707 ms |  764 ms | 25 cases          |
| Three-fixture browser demo |       3 | 34.08 s | 35.40 s | 70 boundary cases |

The measured demo produced 18 findings: 3 accessibility violations and 15
validation mismatches. It classified 40 expected business rejections and
reported 0 runtime errors. Per-fixture details remain in
`reports/demo/summary.json`.

The published
`formstorm-lab-0.1.0-playwright-evidence-any.zip` contains the matching
synthetic reports, screenshots, and traces.

No fixed latency threshold is used as a CI bypass. A material regression is investigated by comparing the same commit, browser version, host, workload, and warm-up policy.

## Interpreting results

- Core generation mainly measures schema extraction, oracle evaluation, Faker generation, and JSON serialization.
- Browser demo timing includes compilation, three browser contexts, axe-core, boundary probes, minimization, screenshots, traces, and report writers.
- The fixed seed stabilizes values and ordering, not operating system scheduling or browser startup time.
- A faster result with missing findings or fewer fixture paths is not an optimization.
