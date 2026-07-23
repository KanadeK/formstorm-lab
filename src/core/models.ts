import { z } from "zod";

import { REPORT_SCHEMA_VERSION, VERSION } from "./version.js";

export const CORE_SCOPE_VERSION = "0.1.0" as const;

export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;

export const SeedSchema = z.number().int().min(0).max(0xffff_ffff);

export const FieldKindSchema = z.enum([
  "text",
  "email",
  "number",
  "date",
  "file",
  "select",
]);
export type FieldKind = z.infer<typeof FieldKindSchema>;

export const BoundaryDimensionSchema = z.enum([
  "length",
  "unicode",
  "rtl",
  "whitespace",
  "date",
  "filename",
  "email",
  "number",
  "select",
]);
export type BoundaryDimension = z.infer<typeof BoundaryDimensionSchema>;

export const ConstraintProvenanceSchema = z.strictObject({
  constraint: z.string().min(1),
  origin: z.enum(["json-schema", "html", "inferred"]),
  sourcePath: z.string().min(1),
  keyword: z.string().min(1),
});
export type ConstraintProvenance = z.infer<typeof ConstraintProvenanceSchema>;

export const FieldOptionSchema = z.strictObject({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

export const FieldConstraintsSchema = z
  .strictObject({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    exclusiveMinimum: z.number().optional(),
    exclusiveMaximum: z.number().optional(),
    multipleOf: z.number().positive().optional(),
    integer: z.boolean().optional(),
    pattern: z.string().optional(),
    format: z.enum(["email", "date", "binary"]).optional(),
    minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    maxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    defaultValue: JsonValueSchema.optional(),
    examples: z.array(JsonValueSchema).optional(),
  })
  .superRefine((constraints, context) => {
    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      context.addIssue({
        code: "custom",
        message: "minLength must not exceed maxLength",
        path: ["minLength"],
      });
    }

    if (
      constraints.minimum !== undefined &&
      constraints.maximum !== undefined &&
      constraints.minimum > constraints.maximum
    ) {
      context.addIssue({
        code: "custom",
        message: "minimum must not exceed maximum",
        path: ["minimum"],
      });
    }

    if (
      constraints.exclusiveMinimum !== undefined &&
      constraints.exclusiveMaximum !== undefined &&
      constraints.exclusiveMinimum >= constraints.exclusiveMaximum
    ) {
      context.addIssue({
        code: "custom",
        message: "exclusiveMinimum must be lower than exclusiveMaximum",
        path: ["exclusiveMinimum"],
      });
    }
  });
export type FieldConstraints = z.infer<typeof FieldConstraintsSchema>;

export const FieldModelSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    label: z.string().min(1),
    kind: FieldKindSchema,
    required: z.boolean(),
    constraints: FieldConstraintsSchema,
    options: z.array(FieldOptionSchema),
    provenance: z.array(ConstraintProvenanceSchema),
  })
  .superRefine((field, context) => {
    if (field.kind === "select" && field.options.length === 0) {
      context.addIssue({
        code: "custom",
        message: "select fields require at least one option",
        path: ["options"],
      });
    }
    if (field.kind !== "select" && field.options.length > 0) {
      context.addIssue({
        code: "custom",
        message: "only select fields may define options",
        path: ["options"],
      });
    }
  });
export type FieldModel = z.infer<typeof FieldModelSchema>;

export const FormModelSchema = z
  .strictObject({
    version: z.literal(CORE_SCOPE_VERSION),
    id: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    fields: z.array(FieldModelSchema).min(1),
  })
  .superRefine((form, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const [index, field] of form.fields.entries()) {
      if (ids.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate field id: ${field.id}`,
          path: ["fields", index, "id"],
        });
      }
      if (names.has(field.name)) {
        context.addIssue({
          code: "custom",
          message: `duplicate field name: ${field.name}`,
          path: ["fields", index, "name"],
        });
      }
      ids.add(field.id);
      names.add(field.name);
    }
  });
export type FormModel = z.infer<typeof FormModelSchema>;

export const FormAssignmentsSchema = z.record(z.string().min(1), JsonValueSchema);
export type FormAssignments = z.infer<typeof FormAssignmentsSchema>;

export const TestExpectationSchema = z.enum(["accept", "reject", "observe"]);
export type TestExpectation = z.infer<typeof TestExpectationSchema>;

export const TestCaseSchema = z.strictObject({
  id: z.string().min(1),
  seed: SeedSchema,
  fieldId: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  variant: z.string().min(1),
  description: z.string().min(1),
  assignments: FormAssignmentsSchema,
  expectation: TestExpectationSchema,
  provenance: z.array(ConstraintProvenanceSchema),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const SchemaDiagnosticSchema = z.strictObject({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  path: z.string().min(1),
  message: z.string().min(1),
  keyword: z.string().min(1).optional(),
});
export type SchemaDiagnostic = z.infer<typeof SchemaDiagnosticSchema>;

export const SchemaValidationIssueSchema = z.strictObject({
  instancePath: z.string(),
  schemaPath: z.string(),
  keyword: z.string().min(1),
  message: z.string(),
  params: JsonValueSchema,
});
export type SchemaValidationIssue = z.infer<typeof SchemaValidationIssueSchema>;

export const SchemaValidationResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    errors: z.tuple([]),
  }),
  z.strictObject({
    valid: z.literal(false),
    errors: z.array(SchemaValidationIssueSchema).min(1),
  }),
]);
export type SchemaValidationResult = z.infer<typeof SchemaValidationResultSchema>;

export const RuntimeErrorSchema = z.strictObject({
  name: z.string().min(1),
  message: z.string(),
  stack: z.string().optional(),
});
export type RuntimeError = z.infer<typeof RuntimeErrorSchema>;

export const ObservedOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("accepted"),
    message: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal("rejected"),
    message: z.string().optional(),
    validationMessages: z.array(z.string()).default([]),
  }),
  z.strictObject({
    kind: z.literal("runtime-crash"),
    error: RuntimeErrorSchema,
  }),
  z.strictObject({
    kind: z.literal("timeout"),
    timeoutMs: z.number().int().positive(),
    message: z.string().optional(),
  }),
]);
export type ObservedOutcome = z.infer<typeof ObservedOutcomeSchema>;

export const OutcomeClassificationSchema = z.enum([
  "passed",
  "expected-rejection",
  "unexpected-acceptance",
  "unexpected-rejection",
  "runtime-crash",
  "timeout",
  "observed",
]);
export type OutcomeClassification = z.infer<typeof OutcomeClassificationSchema>;

export const FindingSchema = z.strictObject({
  id: z.string().min(1),
  caseId: z.string().min(1),
  fieldId: z.string().min(1).optional(),
  category: z.enum(["validation", "runtime", "accessibility", "policy"]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  title: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
  evidence: z.record(z.string(), JsonValueSchema).default({}),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RunResultSchema = z.strictObject({
  case: TestCaseSchema,
  observed: ObservedOutcomeSchema,
  classification: OutcomeClassificationSchema,
  durationMs: z.number().min(0),
  findingIds: z.array(z.string().min(1)).default([]),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const ReportArtifactSchema = z.strictObject({
  kind: z.enum(["screenshot", "trace", "axe", "replay", "log"]),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
});
export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

export const RunSummarySchema = z.strictObject({
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  expectedRejections: z.number().int().min(0),
  observed: z.number().int().min(0),
  failures: z.number().int().min(0),
  runtimeCrashes: z.number().int().min(0),
  timeouts: z.number().int().min(0),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ReportTargetSchema = z.strictObject({
  url: z.url(),
  origin: z.url(),
});
export type ReportTarget = z.infer<typeof ReportTargetSchema>;

export const RunReportSchema = z
  .strictObject({
    schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
    toolVersion: z.literal(VERSION),
    generatedAt: z.iso.datetime({ offset: true }),
    seed: SeedSchema,
    target: ReportTargetSchema,
    form: FormModelSchema,
    summary: RunSummarySchema,
    results: z.array(RunResultSchema),
    findings: z.array(FindingSchema),
    artifacts: z.array(ReportArtifactSchema).default([]),
  })
  .superRefine((report, context) => {
    if (report.summary.total !== report.results.length) {
      context.addIssue({
        code: "custom",
        message: "summary.total must match results.length",
        path: ["summary", "total"],
      });
    }

    const classified =
      report.summary.passed +
      report.summary.expectedRejections +
      report.summary.observed +
      report.summary.failures;
    if (classified !== report.summary.total) {
      context.addIssue({
        code: "custom",
        message:
          "passed + expectedRejections + observed + failures must match summary.total",
        path: ["summary"],
      });
    }
  });
export type RunReport = z.infer<typeof RunReportSchema>;

export const ReplayManifestSchema = z.strictObject({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  toolVersion: z.literal(VERSION),
  createdAt: z.iso.datetime({ offset: true }),
  seed: SeedSchema,
  targetUrl: z.url(),
  form: FormModelSchema,
  case: TestCaseSchema,
  command: z.array(z.string().min(1)).min(1),
});
export type ReplayManifest = z.infer<typeof ReplayManifestSchema>;
