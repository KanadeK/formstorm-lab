import { AxeBuilder } from "@axe-core/playwright";
import { isAbsolute, join, relative } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  classifyOutcome,
  createSchemaOracle,
  extractFormModel,
  failureSignature,
  generateBoundaryCases,
  isFailureClassification,
  minimizeFailure,
  type FormAssignments,
  type ObservedOutcome,
  type TestCase,
} from "../core/index.js";
import { renderHtmlReport, renderJsonReport, renderJunitReport } from "../reporters/index.js";
import { ArtifactStore } from "./artifact-store.js";
import { extractDomForms } from "./dom-form.js";
import { findSiblingFixtureProfile, loadFixtureProfile, loadJsonSchema } from "./file-schema.js";
import { mergeSchemaAndDom, minimalMismatchInput } from "./schema-dom-merge.js";
import type {
  BrowserOutcome,
  BoundaryCaseResult,
  BrowserScanOptions,
  BrowserScanReport,
  FixtureProfile,
  ScanFinding,
  SecurityEvent,
} from "./types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class BrowserPolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BrowserPolicyError";
  }
}

function exactOrigins(values: readonly string[]): readonly string[] {
  const origins = values.map((value) => {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new BrowserPolicyError(`Allowlist entries must use HTTP(S): ${value}`);
    }
    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.href !== `${parsed.origin}/`
    ) {
      throw new BrowserPolicyError(`Allowlist entries must be exact origins, not paths: ${value}`);
    }
    return parsed.origin;
  });
  return [...new Set(origins)].sort();
}

export function assertTargetAllowed(
  target: string,
  exactAllowlist: readonly string[],
): readonly string[] {
  const parsedTarget = new URL(target);
  if (!["http:", "https:"].includes(parsedTarget.protocol)) {
    throw new BrowserPolicyError("Browser targets must use HTTP(S).");
  }
  if (
    parsedTarget.username.length > 0 ||
    parsedTarget.password.length > 0 ||
    parsedTarget.search.length > 0 ||
    parsedTarget.hash.length > 0
  ) {
    throw new BrowserPolicyError(
      "Browser targets must not contain credentials, query strings, or fragments.",
    );
  }
  const origins = exactOrigins(exactAllowlist);
  if (!origins.includes(parsedTarget.origin)) {
    throw new BrowserPolicyError(
      `Target origin ${parsedTarget.origin} is not in the exact allowlist.`,
    );
  }
  return origins;
}

export async function installRequestPolicy(
  context: BrowserContext,
  allowlist: readonly string[],
  events: SecurityEvent[],
): Promise<void> {
  const allowed = new Set(allowlist);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      await route.continue();
      return;
    }
    if (!allowed.has(parsed.origin)) {
      events.push({
        action: "blocked",
        method: request.method(),
        reason: "unallowlisted-origin",
        url,
      });
      await route.abort("blockedbyclient");
      return;
    }
    if (!SAFE_METHODS.has(request.method().toUpperCase())) {
      events.push({
        action: "blocked",
        method: request.method(),
        reason: "state-changing-request",
        url,
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

async function fillValues(
  profile: FixtureProfile,
  values: Readonly<Record<string, string>>,
  page: Page,
): Promise<void> {
  const form = page.locator(profile.formSelector);
  for (const [name, value] of Object.entries(values)) {
    const control = form.locator(`[name=${JSON.stringify(name)}]`).first();
    const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
    const inputType = await control.getAttribute("type");
    if (tagName === "select") {
      await control.selectOption(value);
    } else if (inputType === "checkbox" || inputType === "radio") {
      await control.setChecked(value === "true" || value === "on" || value === "1");
    } else {
      await control.fill(value);
    }
  }
}

async function observeAssignments(
  assignments: FormAssignments,
  profile: FixtureProfile | undefined,
  page: Page,
  pageErrors: string[],
): Promise<ObservedOutcome> {
  const formSelector = profile?.formSelector ?? "form";
  const form = page.locator(formSelector).first();
  await form.evaluate((element) => {
    if (!(element instanceof HTMLFormElement))
      throw new Error("Form selector did not match a form.");
    element.reset();
  });
  if (profile !== undefined) {
    await page.locator(profile.statusSelector).evaluate((element) => {
      element.textContent = "";
      element.removeAttribute("data-outcome");
    });
  }
  const errorCount = pageErrors.length;
  for (const [name, value] of Object.entries(assignments)) {
    const control = form.locator(`[name=${JSON.stringify(name)}]`).first();
    if ((await control.count()) === 0) continue;
    const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
    const inputType = await control.getAttribute("type");
    try {
      if (inputType === "file") {
        const filename = typeof value === "string" && value.length > 0 ? value : "fixture.txt";
        await control.setInputFiles({
          buffer: Buffer.from("FormStorm synthetic boundary input", "utf8"),
          mimeType: "application/octet-stream",
          name: filename.replaceAll("\\", "_").replaceAll("/", "_"),
        });
      } else if (tagName === "select") {
        await control.selectOption(scalarControlValue(value));
      } else if (inputType === "checkbox" || inputType === "radio") {
        await control.setChecked(value === true || value === "true" || value === 1);
      } else {
        await control.fill(scalarControlValue(value));
      }
    } catch (error) {
      if (tagName !== "select" && inputType !== "date") {
        throw error;
      }
      return {
        kind: "rejected",
        message: "The browser control rejected the boundary value.",
        validationMessages: [`${name}: browser control rejected value`],
      };
    }
  }
  const validity = await form.evaluate((element) => {
    if (!(element instanceof HTMLFormElement))
      throw new Error("Form selector did not match a form.");
    const invalid = [...element.elements]
      .filter(
        (control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement,
      )
      .filter((control) => !control.validity.valid)
      .map((control) => `${control.name}: ${control.validationMessage}`);
    return { valid: element.checkValidity(), validationMessages: invalid };
  });
  if (!validity.valid) {
    return {
      kind: "rejected",
      message: "Native form validation rejected the input.",
      validationMessages: validity.validationMessages,
    };
  }
  if (profile !== undefined) {
    await page.locator(`${profile.formSelector} button[type="submit"]`).click();
    const status = page.locator(profile.statusSelector);
    const marker = await status.getAttribute("data-outcome");
    const message = (await status.textContent())?.trim() ?? "";
    if (pageErrors.length > errorCount) {
      return {
        error: { message: pageErrors.at(-1) ?? "Unknown page error", name: "PageError" },
        kind: "runtime-crash",
      };
    }
    if (marker === "rejected") {
      return { kind: "rejected", message, validationMessages: [] };
    }
    return { kind: "accepted", ...(message.length === 0 ? {} : { message }) };
  }
  return { kind: "accepted", message: "Native form constraints accepted the input." };
}

function scalarControlValue(value: FormAssignments[string]): string {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function selectBoundaryCases(
  cases: readonly TestCase[],
  caseId: string | undefined,
): readonly TestCase[] {
  if (caseId !== undefined) {
    const selected = cases.find((testCase) => testCase.id === caseId);
    if (selected === undefined) {
      throw new Error(`Boundary case was not generated for this schema: ${caseId}`);
    }
    return [selected];
  }
  const counts = new Map<string, number>();
  return cases.filter((testCase) => {
    const key = `${testCase.fieldId}:${testCase.dimension}`;
    const count = counts.get(key) ?? 0;
    if (count >= 5) return false;
    counts.set(key, count + 1);
    return true;
  });
}

async function executeBoundaryCases(
  schema: unknown,
  profile: FixtureProfile | undefined,
  page: Page,
  pageErrors: string[],
  options: BrowserScanOptions,
): Promise<{ findings: ScanFinding[]; results: BoundaryCaseResult[] }> {
  const { form } = extractFormModel(schema);
  const oracle = createSchemaOracle(schema);
  const testCases = selectBoundaryCases(
    generateBoundaryCases(form, {
      dimensions: ["length", "unicode", "rtl", "whitespace", "date", "filename"],
      oracle,
      seed: options.seed,
    }),
    options.caseId,
  );
  const results: BoundaryCaseResult[] = [];
  const findings: ScanFinding[] = [];
  for (const testCase of testCases) {
    const started = performance.now();
    let observed: ObservedOutcome;
    try {
      observed = await observeAssignments(testCase.assignments, profile, page, pageErrors);
    } catch (error) {
      observed = {
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "BrowserCaseError",
        },
        kind: "runtime-crash",
      };
    }
    const classification = classifyOutcome(testCase.expectation, observed);
    const command = reportReplayCommand(options, testCase.id);
    let minimalInput: FormAssignments | undefined;
    if (isFailureClassification(classification) && observed.kind !== "runtime-crash") {
      const signature = failureSignature(classification, observed);
      const minimized = await minimizeFailure(
        testCase.assignments,
        async (candidate) => {
          let candidateObserved: ObservedOutcome;
          try {
            candidateObserved = await observeAssignments(candidate, profile, page, pageErrors);
          } catch {
            return { failed: false };
          }
          const candidateClassification = classifyOutcome(testCase.expectation, candidateObserved);
          const candidateSignature = failureSignature(candidateClassification, candidateObserved);
          return candidateClassification === classification && candidateSignature === signature
            ? { failed: true, signature: candidateSignature }
            : { failed: false };
        },
        { maxAttempts: 12 },
      );
      minimalInput = minimized.assignments;
    }
    results.push({
      caseId: testCase.id,
      classification,
      dimension: testCase.dimension,
      durationMs: Math.max(0, performance.now() - started),
      expectation: testCase.expectation,
      fieldId: testCase.fieldId,
      ...(minimalInput === undefined ? {} : { minimalInput }),
      observed,
      replayCommand: command,
      variant: testCase.variant,
    });
    if (isFailureClassification(classification)) {
      findings.push({
        evidence: {
          classification,
          dimension: testCase.dimension,
          expectation: testCase.expectation,
          minimalInput: minimalInput ?? testCase.assignments,
          observed,
          replayCommand: command,
          variant: testCase.variant,
        },
        field: testCase.fieldId,
        id: `boundary-${testCase.id}`,
        kind: classification === "runtime-crash" ? "runtime" : "validation-mismatch",
        message: `${testCase.description}: ${classification}`,
        severity: "error",
      });
    }
  }
  return { findings, results };
}

async function runBusinessCases(
  profile: FixtureProfile | undefined,
  page: Page,
  pageErrors: string[],
): Promise<readonly BrowserOutcome[]> {
  if (profile?.businessCases === undefined) return [];
  const outcomes: BrowserOutcome[] = [];
  for (const businessCase of profile.businessCases) {
    const errorCount = pageErrors.length;
    await fillValues(profile, { ...profile.defaults, ...businessCase.values }, page);
    await page.locator(`${profile.formSelector} button[type="submit"]`).click();
    const status = page.locator(profile.statusSelector);
    await status.waitFor({ state: "visible" });
    const actualMessage = (await status.textContent())?.trim() ?? "";
    const marker = await status.getAttribute("data-outcome");
    const actualOutcome =
      pageErrors.length > errorCount
        ? "crashed"
        : marker === "accepted" || marker === "rejected"
          ? marker
          : "unknown";
    outcomes.push({
      actualMessage,
      actualOutcome,
      caseName: businessCase.name,
      expectedOutcome: businessCase.expectedOutcome,
      matchedExpectation:
        actualOutcome === businessCase.expectedOutcome &&
        actualMessage.includes(businessCase.expectedMessage),
    });
  }
  return outcomes;
}

function reportReplayCommand(options: BrowserScanOptions, caseId?: string): string {
  const relativeOut = relative(process.cwd(), options.outDir);
  const reportPath =
    relativeOut !== "" && !relativeOut.startsWith("..") && !isAbsolute(relativeOut)
      ? join(relativeOut, "report.json")
      : "report.json";
  const caseArgument = caseId === undefined ? "" : ` --case-id ${JSON.stringify(caseId)}`;
  return `formstorm replay --report ${JSON.stringify(reportPath)}${caseArgument}`;
}

function replaySafeSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(replaySafeSchema);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "default" && key !== "examples")
        .map(([key, child]) => [key, replaySafeSchema(child)]),
    );
  }
  return value;
}

export async function runBrowserScan(options: BrowserScanOptions): Promise<BrowserScanReport> {
  if (options.fixtureId !== undefined && !/^[a-z0-9][a-z0-9-]*$/u.test(options.fixtureId)) {
    throw new Error(`Invalid fixture id: ${options.fixtureId}`);
  }
  const allowlist = assertTargetAllowed(options.target, options.exactAllowlist);
  const loaded = await loadJsonSchema(options.schemaPath);
  const profilePath = options.profilePath ?? (await findSiblingFixtureProfile(loaded.absolutePath));
  const profile = profilePath === undefined ? undefined : await loadFixtureProfile(profilePath);
  const store = new ArtifactStore(options.outDir);
  await store.ensure();
  await store.write(
    "input.schema.json",
    `${JSON.stringify(replaySafeSchema(loaded.schema), null, 2)}\n`,
    "schema",
  );
  const ownedBrowser = options.browser === undefined;
  const browser = options.browser ?? (await chromium.launch({ headless: true }));
  const context = await browser.newContext({
    locale: "en-US",
    serviceWorkers: "block",
    viewport: { height: 900, width: 1280 },
  });
  const securityEvents: SecurityEvent[] = [];
  const pageErrors: string[] = [];
  await installRequestPolicy(context, allowlist, securityEvents);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const response = await page.goto(options.target, { waitUntil: "domcontentloaded" });
    if (response !== null && response.status() >= 400) {
      throw new Error(`Target returned HTTP ${String(response.status())}.`);
    }
    const forms = await extractDomForms(page);
    const merged = mergeSchemaAndDom(loaded.schema, forms);
    const axe = await new AxeBuilder({ page }).analyze();
    const findings: ScanFinding[] = merged.mismatches.map((mismatch, index) => ({
      evidence: {
        domValue: mismatch.domValue,
        locator: mismatch.locator,
        minimalInput: { [mismatch.field]: minimalMismatchInput(mismatch) },
        replayCommand: reportReplayCommand(options),
        schemaValue: mismatch.schemaValue,
      },
      field: mismatch.field,
      id: `validation-${mismatch.field}-${mismatch.constraint}-${String(index + 1)}`,
      kind: "validation-mismatch",
      message: mismatch.message,
      severity: "error",
    }));
    for (const violation of axe.violations) {
      findings.push({
        evidence: {
          help: violation.help,
          helpUrl: violation.helpUrl,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({
            failureSummary: node.failureSummary,
            html: node.html,
            target: node.target,
          })),
          replayCommand: reportReplayCommand(options),
        },
        id: `axe-${violation.id}`,
        kind: "accessibility",
        message: violation.description,
        ruleId: violation.id,
        severity: violation.impact === "minor" ? "warning" : "error",
        target: violation.nodes.flatMap((node) => node.target.map(String)),
      });
    }
    const boundary = await executeBoundaryCases(loaded.schema, profile, page, pageErrors, options);
    findings.push(...boundary.findings);
    const browserOutcomes = await runBusinessCases(profile, page, pageErrors);
    for (const [index, message] of pageErrors.entries()) {
      findings.push({
        evidence: {
          message,
          minimalInput: {},
          replayCommand: reportReplayCommand(options),
        },
        id: `runtime-pageerror-${String(index + 1)}`,
        kind: "runtime",
        message,
        severity: "error",
      });
    }
    for (const outcome of browserOutcomes.filter((entry) => !entry.matchedExpectation)) {
      findings.push({
        evidence: {
          minimalInput: { businessCase: outcome.caseName },
          outcome,
          replayCommand: reportReplayCommand(options),
        },
        id: `runtime-outcome-${outcome.caseName}`,
        kind: "runtime",
        message: `Business case ${outcome.caseName} did not match its expected outcome.`,
        severity: "error",
      });
    }

    const screenshotPath = store.pathFor("scan.png");
    await page.screenshot({ fullPage: true, path: screenshotPath });
    const tracePath = store.pathFor("trace.zip");
    await context.tracing.stop({ path: tracePath });
    const artifacts = [
      { kind: "screenshot", path: "scan.png" },
      { kind: "trace", path: "trace.zip" },
      { kind: "schema", path: "input.schema.json" },
      { kind: "json", path: "report.json" },
      { kind: "html", path: "report.html" },
      { kind: "junit", path: "report.junit.xml" },
    ] as const;
    const report: BrowserScanReport = {
      allowlist,
      artifacts,
      boundaryResults: boundary.results,
      browserOutcomes,
      findings,
      ...(options.fixtureId === undefined ? {} : { fixtureId: options.fixtureId }),
      forms,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
      schemaPath: "input.schema.json",
      schemaVersion: "1",
      securityEvents,
      seed: options.seed,
      status: findings.length === 0 ? "completed" : "completed-with-findings",
      summary: {
        accessibilityViolations: findings.filter((entry) => entry.kind === "accessibility").length,
        boundaryCases: boundary.results.length,
        boundaryFailures: boundary.results.filter((entry) =>
          isFailureClassification(entry.classification),
        ).length,
        expectedRejections: boundary.results.filter(
          (entry) => entry.classification === "expected-rejection",
        ).length,
        findings: findings.length,
        runtimeErrors: findings.filter((entry) => entry.kind === "runtime").length,
        securityBlocks: securityEvents.length,
        validationMismatches: findings.filter((entry) => entry.kind === "validation-mismatch")
          .length,
      },
      target:
        options.fixtureId === undefined
          ? options.target
          : `fixture://${options.fixtureId}/index.html`,
    };
    await store.write("report.json", renderJsonReport(report), "json");
    await store.write("report.html", renderHtmlReport(report), "html");
    await store.write("report.junit.xml", renderJunitReport(report), "junit");
    return report;
  } finally {
    await context.close();
    if (ownedBrowser) await browser.close();
  }
}
