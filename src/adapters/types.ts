import type { Browser } from "playwright";
import type {
  BoundaryDimension,
  FormAssignments,
  ObservedOutcome,
  OutcomeClassification,
  TestExpectation,
} from "../core/index.js";

export type JsonSchemaType =
  "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface JsonSchema {
  readonly $id?: string;
  readonly $ref?: string;
  readonly $schema?: string;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly const?: unknown;
  readonly default?: unknown;
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly examples?: readonly unknown[];
  readonly format?: string;
  readonly items?: JsonSchema | readonly JsonSchema[];
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly minLength?: number;
  readonly multipleOf?: number;
  readonly pattern?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly [keyword: string]: unknown;
}

export interface LoadedJsonSchema {
  readonly absolutePath: string;
  readonly schema: JsonSchema;
  readonly sourceText: string;
}

export type DomLabelSource = "aria-label" | "aria-labelledby" | "label" | "placeholder" | "none";

export interface DomLocator {
  readonly css: string;
  readonly index: number;
}

export interface DomFieldConstraints {
  readonly max?: string;
  readonly maxLength?: number;
  readonly min?: string;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly required: boolean;
  readonly step?: string;
}

export interface DomField {
  readonly autocomplete?: string;
  readonly disabled: boolean;
  readonly formIndex: number;
  readonly id?: string;
  readonly inputType: string;
  readonly label?: string;
  readonly labelSource: DomLabelSource;
  readonly locator: DomLocator;
  readonly multiple: boolean;
  readonly name: string;
  readonly options?: readonly string[];
  readonly order: number;
  readonly readOnly: boolean;
  readonly tagName: "input" | "select" | "textarea";
  readonly constraints: DomFieldConstraints;
}

export interface DomForm {
  readonly action: string;
  readonly fields: readonly DomField[];
  readonly id?: string;
  readonly index: number;
  readonly locator: DomLocator;
  readonly method: string;
  readonly name?: string;
}

export type ConstraintName =
  | "enum"
  | "format"
  | "maximum"
  | "maxLength"
  | "minimum"
  | "minLength"
  | "pattern"
  | "required"
  | "type";

export interface ValidationMismatch {
  readonly constraint: ConstraintName;
  readonly domValue: unknown;
  readonly field: string;
  readonly locator?: DomLocator;
  readonly message: string;
  readonly schemaValue: unknown;
}

export interface MergedFormModel {
  readonly fields: readonly MergedFieldModel[];
  readonly forms: readonly DomForm[];
  readonly mismatches: readonly ValidationMismatch[];
  readonly schemaTitle?: string;
}

export interface MergedFieldModel {
  readonly dom?: DomField;
  readonly name: string;
  readonly requiredBySchema: boolean;
  readonly schema: JsonSchema;
}

export interface FixtureBusinessCase {
  readonly expectedMessage: string;
  readonly expectedOutcome: "accepted" | "rejected";
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface FixtureProfile {
  readonly businessCases?: readonly FixtureBusinessCase[];
  readonly defaults: Readonly<Record<string, string>>;
  readonly formSelector: string;
  readonly id: string;
  readonly statusSelector: string;
}

export type FindingKind = "accessibility" | "runtime" | "security" | "validation-mismatch";

export type FindingSeverity = "error" | "info" | "warning";

export interface ScanFinding {
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly field?: string;
  readonly id: string;
  readonly kind: FindingKind;
  readonly message: string;
  readonly ruleId?: string;
  readonly severity: FindingSeverity;
  readonly target?: readonly string[];
}

export interface SecurityEvent {
  readonly action: "blocked";
  readonly method: string;
  readonly reason: "state-changing-request" | "unallowlisted-origin";
  readonly url: string;
}

export interface BrowserOutcome {
  readonly actualMessage: string;
  readonly actualOutcome: "accepted" | "crashed" | "rejected" | "unknown";
  readonly caseName: string;
  readonly expectedOutcome: "accepted" | "rejected";
  readonly matchedExpectation: boolean;
}

export interface ArtifactReference {
  readonly kind: "html" | "json" | "junit" | "schema" | "screenshot" | "trace";
  readonly path: string;
}

export interface BrowserScanSummary {
  readonly accessibilityViolations: number;
  readonly boundaryCases: number;
  readonly boundaryFailures: number;
  readonly expectedRejections: number;
  readonly findings: number;
  readonly runtimeErrors: number;
  readonly securityBlocks: number;
  readonly validationMismatches: number;
}

export interface BoundaryCaseResult {
  readonly caseId: string;
  readonly classification: OutcomeClassification;
  readonly dimension: BoundaryDimension;
  readonly durationMs: number;
  readonly expectation: TestExpectation;
  readonly fieldId: string;
  readonly minimalInput?: FormAssignments;
  readonly observed: ObservedOutcome;
  readonly replayCommand: string;
  readonly variant: string;
}

export interface BrowserScanReport {
  readonly allowlist: readonly string[];
  readonly artifacts: readonly ArtifactReference[];
  readonly browserOutcomes: readonly BrowserOutcome[];
  readonly boundaryResults: readonly BoundaryCaseResult[];
  readonly findings: readonly ScanFinding[];
  readonly fixtureId?: string;
  readonly forms: readonly DomForm[];
  readonly generatedAt: string;
  readonly schemaPath: string;
  readonly schemaVersion: "1";
  readonly securityEvents: readonly SecurityEvent[];
  readonly seed: number;
  readonly status: "completed" | "completed-with-findings";
  readonly summary: BrowserScanSummary;
  readonly target: string;
}

export interface BrowserScanOptions {
  readonly browser?: Browser;
  readonly caseId?: string;
  readonly exactAllowlist: readonly string[];
  readonly fixtureId?: string;
  readonly now?: () => Date;
  readonly outDir: string;
  readonly profilePath?: string;
  readonly schemaPath: string;
  readonly seed: number;
  readonly target: string;
}

export interface ArtifactWriteEvent {
  readonly absolutePath: string;
  readonly kind: ArtifactReference["kind"];
  readonly relativePath: string;
}

export interface ArtifactStoreOptions {
  readonly onWrite?: (event: ArtifactWriteEvent) => void;
}
