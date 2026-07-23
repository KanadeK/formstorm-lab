import { extractFormModel, generateBoundaryCases } from "../core/index.js";
import type { BoundaryDimension, FieldModel, FormModel, TestCase } from "../core/index.js";

import "./styles.css";

interface SampleFinding {
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly message: string;
  readonly field?: string;
  readonly ruleId?: string;
  readonly target?: readonly string[];
}

interface SampleReport {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly target: unknown;
  readonly seed: number;
  readonly status: string;
  readonly findings: readonly SampleFinding[];
  readonly summary: {
    readonly findings: number;
  };
}

const examplePaths: Readonly<Record<string, string>> = {
  checkout: "examples/checkout.schema.json",
  "multilingual-profile": "examples/multilingual-profile.schema.json",
  registration: "examples/registration.schema.json",
};

const dimensionValues = new Set<BoundaryDimension>([
  "date",
  "filename",
  "length",
  "rtl",
  "unicode",
  "whitespace",
]);

// The generic preserves the concrete DOM type at each call site.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required workbench element is missing: ${selector}`);
  }
  return element;
}

const generatorForm = requiredElement<HTMLFormElement>("#generator-form");
const exampleSelect = requiredElement<HTMLSelectElement>("#schema-example");
const schemaInput = requiredElement<HTMLTextAreaElement>("#schema-input");
const schemaUpload = requiredElement<HTMLInputElement>("#schema-upload");
const schemaStatus = requiredElement<HTMLElement>("#schema-status");
const schemaStateBadge = requiredElement<HTMLElement>("#schema-state-badge");
const constraintList = requiredElement<HTMLElement>("#constraint-list");
const constraintsEmpty = requiredElement<HTMLElement>("#constraints-empty");
const fieldCount = requiredElement<HTMLElement>("#field-count");
const seedInput = requiredElement<HTMLInputElement>("#seed-input");
const generateButton = requiredElement<HTMLButtonElement>("#generate-button");
const resultsPanel = requiredElement<HTMLElement>("#results-panel");
const resultsHeading = requiredElement<HTMLElement>("#results-heading");
const generationStatus = requiredElement<HTMLElement>("#generation-status");
const caseSummary = requiredElement<HTMLElement>("#case-summary");
const summaryCaseCount = requiredElement<HTMLElement>("#summary-case-count");
const summaryFieldCount = requiredElement<HTMLElement>("#summary-field-count");
const summarySeed = requiredElement<HTMLElement>("#summary-seed");
const casesEmpty = requiredElement<HTMLElement>("#cases-empty");
const caseList = requiredElement<HTMLOListElement>("#case-list");
const downloadButton = requiredElement<HTMLButtonElement>("#download-button");
const reportFilter = requiredElement<HTMLSelectElement>("#report-filter");
const reportStatus = requiredElement<HTMLElement>("#report-status");
const reportContent = requiredElement<HTMLElement>("#report-content");
const reportRunStatus = requiredElement<HTMLElement>("#report-run-status");
const reportTarget = requiredElement<HTMLElement>("#report-target");
const reportSeed = requiredElement<HTMLElement>("#report-seed");
const reportFindingCount = requiredElement<HTMLElement>("#report-finding-count");
const reportEmpty = requiredElement<HTMLElement>("#report-empty");
const reportFindings = requiredElement<HTMLOListElement>("#report-findings");

let activeForm: FormModel | undefined;
let generatedCases: readonly TestCase[] = [];
let sampleReport: SampleReport | undefined;

function assetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(path, base).href;
}

function setState(
  element: HTMLElement,
  state: "empty" | "error" | "loading" | "success",
  message: string,
): void {
  element.dataset.state = state;
  element.textContent = message;
}

function printable(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function constraintEntries(field: FieldModel): ReadonlyArray<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [
    ["Required", field.required ? "Yes" : "No"],
    ["Input kind", field.kind],
  ];
  for (const [key, value] of Object.entries(field.constraints)) {
    entries.push([key, printable(value)]);
  }
  if (field.options.length > 0) {
    entries.push(["Options", field.options.map((option) => printable(option.value)).join(", ")]);
  }
  return entries;
}

function renderConstraints(form: FormModel): void {
  constraintList.replaceChildren();
  constraintsEmpty.hidden = true;
  fieldCount.textContent = `${String(form.fields.length)} ${
    form.fields.length === 1 ? "field" : "fields"
  }`;

  for (const field of form.fields) {
    const details = document.createElement("details");
    details.className = "constraint-item";

    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.textContent = field.label;
    const kind = document.createElement("span");
    kind.className = "constraint-kind";
    kind.textContent = field.name;
    summary.append(label, kind);

    const list = document.createElement("dl");
    for (const [key, value] of constraintEntries(field)) {
      const term = document.createElement("dt");
      term.textContent = key;
      const description = document.createElement("dd");
      description.textContent = value;
      list.append(term, description);
    }

    details.append(summary, list);
    constraintList.append(details);
  }
}

function clearSchemaModel(): void {
  activeForm = undefined;
  constraintList.replaceChildren();
  constraintsEmpty.hidden = false;
  fieldCount.textContent = "0 fields";
}

function parseAndInspectSchema(source: string): boolean {
  try {
    const parsed: unknown = JSON.parse(source);
    const extraction = extractFormModel(parsed, { unsupported: "diagnostic" });
    activeForm = extraction.form;
    renderConstraints(extraction.form);
    const diagnosticMessage =
      extraction.diagnostics.length === 0
        ? ""
        : ` ${String(extraction.diagnostics.length)} scope diagnostic${
            extraction.diagnostics.length === 1 ? "" : "s"
          } recorded.`;
    setState(
      schemaStatus,
      "success",
      `${String(extraction.form.fields.length)} fields are ready.${diagnosticMessage}`,
    );
    schemaStateBadge.dataset.state = "success";
    schemaStateBadge.textContent = "Ready";
    return true;
  } catch (error) {
    clearSchemaModel();
    setState(
      schemaStatus,
      "error",
      error instanceof Error ? error.message : "The schema could not be parsed.",
    );
    schemaStateBadge.dataset.state = "error";
    schemaStateBadge.textContent = "Needs input";
    return false;
  }
}

async function loadExample(id: string): Promise<void> {
  const path = examplePaths[id];
  if (path === undefined) {
    clearSchemaModel();
    setState(schemaStatus, "error", "The selected example is not available.");
    return;
  }

  schemaStateBadge.dataset.state = "loading";
  schemaStateBadge.textContent = "Loading";
  setState(schemaStatus, "loading", "Loading the selected schema.");
  try {
    const response = await fetch(assetUrl(path));
    if (!response.ok) {
      throw new Error(`Schema request failed with HTTP ${String(response.status)}.`);
    }
    const source = await response.text();
    schemaInput.value = source;
    parseAndInspectSchema(source);
  } catch (error) {
    clearSchemaModel();
    setState(
      schemaStatus,
      "error",
      error instanceof Error ? error.message : "The selected schema could not be loaded.",
    );
    schemaStateBadge.dataset.state = "error";
    schemaStateBadge.textContent = "Load failed";
  }
}

function selectedDimensions(): BoundaryDimension[] {
  const dimensions: BoundaryDimension[] = [];
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="dimension"]:checked',
  )) {
    const value = input.value as BoundaryDimension;
    if (dimensionValues.has(value)) {
      dimensions.push(value);
    }
  }
  return dimensions;
}

function appendCase(testCase: TestCase): void {
  const item = document.createElement("li");
  item.className = "case-item";

  const topLine = document.createElement("div");
  topLine.className = "case-topline";
  const title = document.createElement("span");
  title.className = "case-title";
  title.textContent = testCase.fieldId;
  const meta = document.createElement("span");
  meta.className = "case-meta";
  meta.textContent = `${testCase.dimension} / ${testCase.variant} / expect ${testCase.expectation}`;
  topLine.append(title, meta);

  const description = document.createElement("p");
  description.className = "case-description";
  description.textContent = testCase.description;

  const assignments = document.createElement("pre");
  assignments.className = "assignment-view";
  assignments.textContent = JSON.stringify(testCase.assignments, null, 2);

  item.append(topLine, description, assignments);
  caseList.append(item);
}

function renderCases(cases: readonly TestCase[], form: FormModel, seed: number): void {
  caseList.replaceChildren();
  for (const testCase of cases) {
    appendCase(testCase);
  }
  casesEmpty.hidden = cases.length > 0;
  caseSummary.hidden = cases.length === 0;
  summaryCaseCount.textContent = String(cases.length);
  summaryFieldCount.textContent = String(form.fields.length);
  summarySeed.textContent = String(seed);
  downloadButton.disabled = cases.length === 0;
}

async function generate(): Promise<void> {
  if (!parseAndInspectSchema(schemaInput.value)) {
    setState(generationStatus, "error", "Fix the schema before generating cases.");
    return;
  }
  if (activeForm === undefined) {
    setState(generationStatus, "error", "No supported fields are available.");
    return;
  }

  const seed = Number(seedInput.value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    setState(generationStatus, "error", "Seed must be an integer from 0 to 4294967295.");
    seedInput.focus();
    return;
  }

  const dimensions = selectedDimensions();
  if (dimensions.length === 0) {
    setState(generationStatus, "error", "Select at least one boundary dimension.");
    return;
  }

  resultsPanel.setAttribute("aria-busy", "true");
  generateButton.disabled = true;
  setState(generationStatus, "loading", "Generating deterministic boundary cases.");
  await Promise.resolve();

  try {
    generatedCases = generateBoundaryCases(activeForm, { seed, dimensions });
    renderCases(generatedCases, activeForm, seed);
    if (generatedCases.length === 0) {
      setState(
        generationStatus,
        "empty",
        "No cases matched these fields and dimensions. Select another dimension.",
      );
    } else {
      setState(
        generationStatus,
        "success",
        `Generated ${String(generatedCases.length)} deterministic cases with seed ${String(seed)}.`,
      );
      resultsHeading.focus();
    }
  } catch (error) {
    generatedCases = [];
    renderCases([], activeForm, seed);
    setState(
      generationStatus,
      "error",
      error instanceof Error ? error.message : "Case generation failed.",
    );
  } finally {
    resultsPanel.setAttribute("aria-busy", "false");
    generateButton.disabled = false;
  }
}

function downloadCases(): void {
  if (generatedCases.length === 0 || activeForm === undefined) {
    return;
  }
  const payload = {
    schemaTitle: activeForm.title ?? "Untitled form",
    seed: generatedCases[0]?.seed ?? Number(seedInput.value),
    generatedAt: new Date().toISOString(),
    cases: generatedCases,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `formstorm-cases-${String(payload.seed)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reportTargetLabel(target: unknown): string {
  if (typeof target === "string") {
    return target;
  }
  if (typeof target === "object" && target !== null && "url" in target) {
    return String((target as { readonly url: unknown }).url);
  }
  return "Local fixture";
}

function renderReportFindings(): void {
  if (sampleReport === undefined) {
    return;
  }
  const filter = reportFilter.value;
  const findings =
    filter === "all"
      ? sampleReport.findings
      : sampleReport.findings.filter((finding) => finding.kind === filter);
  reportFindings.replaceChildren();
  reportEmpty.hidden = findings.length > 0;

  for (const finding of findings) {
    const item = document.createElement("li");
    item.className = "finding-item";
    const topLine = document.createElement("div");
    topLine.className = "finding-topline";
    const title = document.createElement("span");
    title.className = "finding-title";
    title.textContent = finding.ruleId ?? finding.kind;
    const meta = document.createElement("span");
    meta.className = "finding-meta";
    const findingTarget = finding.target === undefined ? undefined : finding.target.join(", ");
    meta.textContent = `${finding.severity} / ${finding.field ?? findingTarget ?? "form"}`;
    topLine.append(title, meta);
    const message = document.createElement("p");
    message.className = "finding-message";
    message.textContent = finding.message;
    item.append(topLine, message);
    reportFindings.append(item);
  }
}

async function loadSampleReport(): Promise<void> {
  setState(reportStatus, "loading", "Loading the committed sample report.");
  try {
    const response = await fetch(assetUrl("reports/sample-report.json"));
    if (!response.ok) {
      throw new Error(`Report request failed with HTTP ${String(response.status)}.`);
    }
    const parsed = (await response.json()) as SampleReport;
    if (!Array.isArray(parsed.findings) || typeof parsed.seed !== "number") {
      throw new Error("The sample report does not match the expected report shape.");
    }
    sampleReport = parsed;
    reportRunStatus.textContent = parsed.status;
    reportTarget.textContent = reportTargetLabel(parsed.target);
    reportSeed.textContent = String(parsed.seed);
    reportFindingCount.textContent = String(parsed.summary.findings);
    reportContent.hidden = false;
    renderReportFindings();
    setState(
      reportStatus,
      "success",
      `Loaded ${String(parsed.findings.length)} findings from the committed sample report.`,
    );
  } catch (error) {
    reportContent.hidden = true;
    setState(
      reportStatus,
      "error",
      error instanceof Error ? error.message : "The sample report could not be loaded.",
    );
  }
}

exampleSelect.addEventListener("change", () => {
  void loadExample(exampleSelect.value);
});

schemaInput.addEventListener("change", () => {
  parseAndInspectSchema(schemaInput.value);
});

schemaUpload.addEventListener("change", () => {
  const file = schemaUpload.files?.[0];
  if (file === undefined) {
    return;
  }
  setState(schemaStatus, "loading", `Reading ${file.name}.`);
  file
    .text()
    .then((source) => {
      schemaInput.value = source;
      parseAndInspectSchema(source);
    })
    .catch((error: unknown) => {
      setState(
        schemaStatus,
        "error",
        error instanceof Error ? error.message : "The selected file could not be read.",
      );
    });
});

generatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void generate();
});

generatorForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void generate();
  }
});

downloadButton.addEventListener("click", downloadCases);
reportFilter.addEventListener("change", renderReportFindings);

void Promise.all([loadExample(exampleSelect.value), loadSampleReport()]);
