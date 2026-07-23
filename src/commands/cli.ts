#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import {
  assertTargetAllowed,
  extractDomForms,
  installRequestPolicy,
  runBrowserScan,
  startFixtureServer,
  loadJsonSchema,
  type BrowserScanReport,
  type SecurityEvent,
} from "../adapters/index.js";
import {
  createSchemaOracle,
  extractFormModel,
  generateBoundaryCases,
  type BoundaryDimension,
} from "../core/index.js";
import { VERSION } from "../core/version.js";

const DEMO_FIXTURES = ["registration", "checkout", "multilingual-profile"] as const;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface ExtractOptions {
  readonly allowOrigin: readonly string[];
  readonly out?: string;
  readonly schema?: string;
  readonly target?: string;
}

interface GenerateOptions {
  readonly dimensions?: string;
  readonly out?: string;
  readonly schema: string;
  readonly seed: number;
}

interface ScanOptions {
  readonly allowOrigin: readonly string[];
  readonly caseId?: string;
  readonly fixtureId?: string;
  readonly out: string;
  readonly profile?: string;
  readonly schema: string;
  readonly seed: number;
  readonly target: string;
}

interface ReplayOptions {
  readonly caseId?: string;
  readonly out?: string;
  readonly report: string;
}

interface DemoOptions {
  readonly out: string;
  readonly seed: number;
}

interface ReplayableReport {
  readonly allowlist: readonly string[];
  readonly fixtureId?: string;
  readonly schemaPath: string;
  readonly seed: number;
  readonly target: string;
}

function parseSeed(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) {
    throw new InvalidArgumentError("seed must be an integer from 0 to 4294967295");
  }
  return parsed;
}

function collectOrigin(value: string, previous: readonly string[]): string[] {
  return [...previous, value];
}

async function writeJson(destination: string, value: unknown): Promise<void> {
  const absolutePath = resolve(destination);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function extractCommand(options: ExtractOptions): Promise<void> {
  if ((options.schema === undefined) === (options.target === undefined)) {
    throw new InvalidArgumentError("provide exactly one of --schema or --target");
  }

  let output: unknown;
  let count: number;
  if (options.schema !== undefined) {
    const loaded = await loadJsonSchema(options.schema);
    const result = extractFormModel(loaded.schema, { unsupported: "diagnostic" });
    output = {
      schemaPath: loaded.absolutePath,
      ...result,
    };
    count = result.form.fields.length;
  } else {
    const target = options.target as string;
    const allowlist = assertTargetAllowed(target, requireAllowlist(options.allowOrigin));
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      serviceWorkers: "block",
    });
    const securityEvents: SecurityEvent[] = [];
    try {
      await installRequestPolicy(context, allowlist, securityEvents);
      const page = await context.newPage();
      const response = await page.goto(target, { waitUntil: "domcontentloaded" });
      if (response !== null && response.status() >= 400) {
        throw new Error(`Target returned HTTP ${String(response.status())}.`);
      }
      const forms = await extractDomForms(page);
      output = { target, forms, securityEvents };
      count = forms.reduce((total, form) => total + form.fields.length, 0);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  if (options.out === undefined) {
    printJson(output);
    return;
  }
  await writeJson(options.out, output);
  process.stdout.write(`Extracted ${String(count)} fields to ${resolve(options.out)}.\n`);
}

function parseDimensions(value: string | undefined): BoundaryDimension[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const dimensions = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) as BoundaryDimension[];
  if (dimensions.length === 0) {
    throw new InvalidArgumentError("dimensions must contain at least one comma-separated value");
  }
  return dimensions;
}

async function generateCommand(options: GenerateOptions): Promise<void> {
  const loaded = await loadJsonSchema(options.schema);
  const extraction = extractFormModel(loaded.schema, { unsupported: "diagnostic" });
  const dimensions = parseDimensions(options.dimensions);
  const cases = generateBoundaryCases(extraction.form, {
    ...(dimensions === undefined ? {} : { dimensions }),
    oracle: createSchemaOracle(loaded.schema),
    seed: options.seed,
  });
  const output = {
    schemaPath: loaded.absolutePath,
    seed: options.seed,
    diagnostics: extraction.diagnostics,
    form: extraction.form,
    cases,
  };
  if (options.out === undefined) {
    printJson(output);
    return;
  }
  await writeJson(options.out, output);
  process.stdout.write(`Generated ${String(cases.length)} cases to ${resolve(options.out)}.\n`);
}

function requireAllowlist(values: readonly string[]): readonly string[] {
  if (values.length === 0) {
    throw new InvalidArgumentError("at least one exact --allow-origin value is required");
  }
  return values;
}

async function scanCommand(options: ScanOptions): Promise<BrowserScanReport> {
  const report = await runBrowserScan({
    ...(options.caseId === undefined ? {} : { caseId: options.caseId }),
    exactAllowlist: requireAllowlist(options.allowOrigin),
    ...(options.fixtureId === undefined ? {} : { fixtureId: options.fixtureId }),
    outDir: options.out,
    ...(options.profile === undefined ? {} : { profilePath: options.profile }),
    schemaPath: options.schema,
    seed: options.seed,
    target: options.target,
  });
  process.stdout.write(
    `Scan completed with ${String(report.summary.findings)} findings. JSON: ${resolve(options.out, "report.json")}\n`,
  );
  return report;
}

function isReplayableReport(value: unknown): value is ReplayableReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReplayableReport>;
  return (
    Array.isArray(candidate.allowlist) &&
    candidate.allowlist.every((entry) => typeof entry === "string") &&
    (candidate.fixtureId === undefined || typeof candidate.fixtureId === "string") &&
    typeof candidate.schemaPath === "string" &&
    typeof candidate.seed === "number" &&
    typeof candidate.target === "string"
  );
}

async function replayCommand(options: ReplayOptions): Promise<void> {
  const reportPath = resolve(options.report);
  const parsed: unknown = JSON.parse(await readFile(reportPath, "utf8"));
  if (!isReplayableReport(parsed)) {
    throw new Error(`Report is not replayable: ${reportPath}`);
  }
  const outDir = options.out ?? join(dirname(reportPath), "replay");
  const schemaPath = resolve(dirname(reportPath), parsed.schemaPath);
  if (parsed.fixtureId !== undefined) {
    const fixtureDirectory = join(PROJECT_ROOT, "fixtures", parsed.fixtureId);
    const server = await startFixtureServer({
      rootDir: join(PROJECT_ROOT, "fixtures"),
    });
    try {
      await scanCommand({
        allowOrigin: [server.origin],
        ...(options.caseId === undefined ? {} : { caseId: options.caseId }),
        fixtureId: parsed.fixtureId,
        out: outDir,
        profile: join(fixtureDirectory, "profile.json"),
        schema: schemaPath,
        seed: parsed.seed,
        target: server.urlFor(`/${parsed.fixtureId}/index.html`),
      });
    } finally {
      await server.close();
    }
    return;
  }
  await scanCommand({
    allowOrigin: parsed.allowlist,
    ...(options.caseId === undefined ? {} : { caseId: options.caseId }),
    out: outDir,
    schema: schemaPath,
    seed: parsed.seed,
    target: parsed.target,
  });
}

function assertFixtureFindings(fixture: string, report: BrowserScanReport): void {
  if (report.summary.accessibilityViolations < 1) {
    throw new Error(`Fixture ${fixture} did not produce its expected accessibility finding.`);
  }
  if (report.summary.validationMismatches < 1) {
    throw new Error(`Fixture ${fixture} did not produce its expected validation finding.`);
  }
  if (report.summary.runtimeErrors > 0) {
    throw new Error(`Fixture ${fixture} produced an unexpected runtime error.`);
  }
}

async function demoCommand(options: DemoOptions): Promise<void> {
  const server = await startFixtureServer({
    rootDir: join(PROJECT_ROOT, "fixtures"),
  });
  const reports: Array<{
    readonly fixture: string;
    readonly report: BrowserScanReport;
  }> = [];
  try {
    for (const fixture of DEMO_FIXTURES) {
      const fixtureDirectory = join(PROJECT_ROOT, "fixtures", fixture);
      const report = await runBrowserScan({
        exactAllowlist: [server.origin],
        fixtureId: fixture,
        outDir: join(options.out, fixture),
        profilePath: join(fixtureDirectory, "profile.json"),
        schemaPath: join(fixtureDirectory, "schema.json"),
        seed: options.seed,
        target: server.urlFor(`/${fixture}/index.html`),
      });
      assertFixtureFindings(fixture, report);
      reports.push({ fixture, report });
    }
  } finally {
    await server.close();
  }

  const summary = {
    version: VERSION,
    seed: options.seed,
    fixtures: reports.map(({ fixture, report }) => ({
      fixture,
      status: report.status,
      summary: report.summary,
      report: `${fixture}/report.json`,
      screenshot: `${fixture}/scan.png`,
      trace: `${fixture}/trace.zip`,
    })),
    totals: reports.reduce(
      (totals, { report }) => ({
        findings: totals.findings + report.summary.findings,
        accessibilityViolations:
          totals.accessibilityViolations + report.summary.accessibilityViolations,
        runtimeErrors: totals.runtimeErrors + report.summary.runtimeErrors,
        validationMismatches: totals.validationMismatches + report.summary.validationMismatches,
      }),
      {
        findings: 0,
        accessibilityViolations: 0,
        runtimeErrors: 0,
        validationMismatches: 0,
      },
    ),
  };
  await writeJson(join(options.out, "summary.json"), summary);
  printJson(summary);
}

export function createProgram(): Command {
  const program = new Command()
    .name("formstorm")
    .description(
      "Generate and execute reproducible form boundary, internationalization, accessibility, and validation tests.",
    )
    .version(VERSION);

  program
    .command("extract")
    .description("Extract fields, labels, and constraints from a schema or webpage")
    .option("--schema <path>", "JSON Schema file")
    .option("--target <url>", "allowlisted HTTP(S) webpage")
    .option(
      "--allow-origin <origin>",
      "exact HTTP(S) origin; repeat for each allowed origin",
      collectOrigin,
      [],
    )
    .option("--out <path>", "write JSON to a file")
    .action(extractCommand);

  program
    .command("generate")
    .description("Generate deterministic boundary cases without launching a browser")
    .requiredOption("--schema <path>", "JSON Schema file")
    .option("--seed <number>", "deterministic unsigned 32-bit seed", parseSeed, 4501)
    .option("--dimensions <list>", "comma-separated dimensions such as length,unicode,rtl")
    .option("--out <path>", "write JSON to a file")
    .action(generateCommand);

  program
    .command("scan")
    .description("Execute form probes and axe checks in Chromium")
    .requiredOption("--schema <path>", "JSON Schema file")
    .requiredOption("--target <url>", "HTTP(S) form URL")
    .option(
      "--allow-origin <origin>",
      "exact HTTP(S) origin; repeat for each allowed origin",
      collectOrigin,
      [],
    )
    .option("--profile <path>", "fixture profile for deterministic business cases")
    .option("--case-id <id>", "execute one generated boundary case")
    .option("--seed <number>", "deterministic unsigned 32-bit seed", parseSeed, 4501)
    .option("--out <directory>", "artifact directory", "reports/scan")
    .action(async (options: ScanOptions) => {
      await scanCommand(options);
    });

  program
    .command("replay")
    .description("Replay a prior report with its schema, target, allowlist, and seed")
    .requiredOption("--report <path>", "report.json created by scan")
    .option("--case-id <id>", "replay one generated boundary case")
    .option("--out <directory>", "artifact directory for the replay")
    .action(replayCommand);

  program
    .command("demo")
    .description("Scan all three offline fixtures and verify their seeded issues")
    .option("--seed <number>", "deterministic unsigned 32-bit seed", parseSeed, 4501)
    .option("--out <directory>", "demo artifact directory", "reports/demo")
    .action(demoCommand);

  return program;
}

const invokedPath = process.argv[1];
const isDirectInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(invokedPath).toLowerCase();
if (isDirectInvocation) {
  await createProgram().parseAsync(process.argv);
}
