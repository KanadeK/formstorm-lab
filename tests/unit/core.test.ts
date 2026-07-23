import { describe, expect, it } from "vitest";

import {
  AllowlistPolicyError,
  FieldConstraintsSchema,
  FieldModelSchema,
  FormModelSchema,
  ReplayManifestSchema,
  RunReportSchema,
  SchemaCompilationError,
  UnsupportedSchemaError,
  addCivilDays,
  assertTargetAllowed,
  classifyOutcome,
  createSchemaOracle,
  extractFormModel,
  generateBaselineAssignments,
  generateBoundaryCases,
  isLeapYear,
  isFailureClassification,
  isTargetAllowed,
  minimizeFailure,
  normalizeOrigin,
  parseCivilDate,
  redactSecrets,
  failureSignature,
  type FormModel,
  type TestCase,
} from "../../src/core/index.js";

const comprehensiveSchema = {
  type: "object",
  title: "Coverage form",
  required: ["bio", "email", "birthday", "count", "role"],
  properties: {
    role: { type: "string", enum: ["reader", "editor"] },
    upload: { type: "string", format: "binary" },
    count: { type: "integer", minimum: 0, maximum: 2 },
    birthday: {
      type: "string",
      format: "date",
      formatMinimum: "2000-02-29",
      formatMaximum: "2024-02-29",
    },
    email: { type: "string", format: "email" },
    bio: { $ref: "#/$defs/shortText", title: "Biography" },
  },
  $defs: {
    shortText: { type: "string", minLength: 2, maxLength: 8 },
  },
} as const;

function model(): FormModel {
  return extractFormModel(comprehensiveSchema).form;
}

function firstCase(cases: readonly TestCase[]): TestCase {
  const first = cases[0];
  if (first === undefined) throw new Error("Expected a generated case");
  return first;
}

describe("strict domain models and schema extraction", () => {
  it("extracts common properties, local refs, labels, and constraint provenance", () => {
    const result = extractFormModel(comprehensiveSchema);
    expect(result.form.version).toBe("0.1.0");
    expect(result.form.fields.map((field) => field.id)).toStrictEqual([
      "bio",
      "birthday",
      "count",
      "email",
      "role",
      "upload",
    ]);
    const bio = result.form.fields.find((field) => field.id === "bio");
    expect(bio).toMatchObject({
      label: "Biography",
      kind: "text",
      required: true,
      constraints: { minLength: 2, maxLength: 8 },
    });
    expect(bio?.provenance).toContainEqual({
      constraint: "minLength",
      keyword: "minLength",
      origin: "json-schema",
      sourcePath: "#/properties/bio/minLength",
    });
    expect(result.form.fields.find((field) => field.id === "role")?.options).toStrictEqual([
      { label: "reader", value: "reader" },
      { label: "editor", value: "editor" },
    ]);
  });

  it("rejects malformed schemas and unknown model properties", () => {
    expect(() => extractFormModel(null)).toThrow("root must be an object");
    expect(() => extractFormModel({ type: "array" })).toThrow("root must have type object");
    expect(() =>
      FormModelSchema.parse({
        version: "0.1.0",
        fields: [
          {
            id: "x",
            name: "x",
            label: "X",
            kind: "text",
            required: false,
            constraints: {},
            options: [],
            provenance: [],
            unexpected: true,
          },
        ],
      }),
    ).toThrow();
  });

  it("reports unsupported external, missing, and recursive refs explicitly", () => {
    for (const schema of [
      {
        type: "object",
        properties: { x: { $ref: "https://example.test/schema.json" } },
      },
      {
        type: "object",
        properties: { x: { $ref: "#/$defs/missing" } },
        $defs: {},
      },
      {
        type: "object",
        properties: { x: { $ref: "#/$defs/loop" } },
        $defs: { loop: { $ref: "#/$defs/loop" } },
      },
    ]) {
      expect(() => extractFormModel(schema)).toThrow(UnsupportedSchemaError);
    }
    try {
      extractFormModel({
        type: "object",
        properties: { x: { $ref: "other.json" } },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaError);
      if (error instanceof UnsupportedSchemaError) {
        expect(error.diagnostic).toMatchObject({
          code: "unsupported-ref",
          keyword: "$ref",
          severity: "error",
        });
      }
    }
  });

  it("can collect unsupported-field diagnostics without silently inventing fields", () => {
    const result = extractFormModel(
      {
        type: "object",
        properties: {
          nested: { type: "object", properties: { value: { type: "string" } } },
          plain: { type: "string" },
        },
      },
      { unsupported: "diagnostic" },
    );
    expect(result.form.fields.map((field) => field.id)).toStrictEqual(["plain"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unsupported-nested-object",
        severity: "error",
      }),
    );
  });
});

describe("deterministic seeded boundary generation", () => {
  it("creates stable baselines and stable case ordering independent of field order", () => {
    const form = model();
    const reversed = { ...form, fields: [...form.fields].reverse() };
    expect(generateBaselineAssignments(form, { seed: 42 })).toStrictEqual(
      generateBaselineAssignments(reversed, { seed: 42 }),
    );
    expect(generateBoundaryCases(form, { seed: 42 })).toStrictEqual(
      generateBoundaryCases(reversed, { seed: 42 }),
    );
    expect(generateBoundaryCases(form, { seed: 42 })).not.toStrictEqual(
      generateBoundaryCases(form, { seed: 43 }),
    );
  });

  it("builds schema-valid baselines for common anchored patterns", () => {
    const schema = {
      type: "object",
      required: ["cardNumber", "postalCode", "username"],
      properties: {
        cardNumber: { type: "string", pattern: "^[0-9]{16}$" },
        postalCode: { type: "string", pattern: "^[0-9]{5}$" },
        username: {
          type: "string",
          minLength: 3,
          maxLength: 12,
          pattern: "^[A-Za-z0-9]+$",
        },
      },
    };
    const { form } = extractFormModel(schema);
    const baseline = generateBaselineAssignments(form, { seed: 4501 });
    expect(createSchemaOracle(schema).validate(baseline)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("covers every v0.1.0 boundary dimension with meaningful variants", () => {
    const cases = generateBoundaryCases(model(), { seed: 7 });
    expect(new Set(cases.map((testCase) => testCase.dimension))).toStrictEqual(
      new Set([
        "length",
        "unicode",
        "rtl",
        "whitespace",
        "date",
        "filename",
        "email",
        "number",
        "select",
      ]),
    );
    expect(cases.find((testCase) => testCase.id === "bio:length:below-min")?.expectation).toBe(
      "reject",
    );
    expect(cases.find((testCase) => testCase.id === "bio:length:at-max")?.expectation).toBe(
      "accept",
    );
    expect(cases.find((testCase) => testCase.id === "email:email:missing-at")?.expectation).toBe(
      "reject",
    );
    expect(
      cases.find((testCase) => testCase.id === "role:select:invalid-option")?.expectation,
    ).toBe("reject");
    expect(cases.find((testCase) => testCase.dimension === "rtl")?.assignments.bio).toMatch(
      /[\u0590-\u08ff]/u,
    );
    expect(cases.find((testCase) => testCase.dimension === "unicode")?.assignments.bio).toMatch(
      /🙂|\u0301/u,
    );
    expect(
      cases.find((testCase) => testCase.id === "upload:filename:unicode")?.assignments.upload,
    ).toContain("文件");
  });

  it("uses an Ajv oracle when exact schema validity is available", () => {
    const schema = {
      type: "object",
      required: ["code"],
      properties: {
        code: {
          type: "string",
          minLength: 2,
          maxLength: 3,
          pattern: "^[A-Za-z]+$",
        },
      },
      additionalProperties: false,
    };
    const form = extractFormModel(schema).form;
    const oracle = createSchemaOracle(schema);
    const cases = generateBoundaryCases(form, { seed: 9, oracle });
    expect(cases.find((testCase) => testCase.variant === "at-min")?.expectation).toBe("accept");
    expect(cases.find((testCase) => testCase.dimension === "rtl")?.expectation).toBe("reject");
  });
});

describe("civil dates and Ajv validation", () => {
  it("handles Gregorian leap rules without local-time conversion", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(parseCivilDate("2024-02-29")).toStrictEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(parseCivilDate("2023-02-29")).toBeUndefined();
    expect(addCivilDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addCivilDays("0001-01-01", 1)).toBe("0001-01-02");
  });

  it("returns structured Ajv success and failure results", () => {
    const oracle = createSchemaOracle({
      type: "object",
      required: ["email"],
      properties: { email: { type: "string", format: "email" } },
      additionalProperties: false,
    });
    expect(oracle.validate({ email: "person@example.test" })).toStrictEqual({
      valid: true,
      errors: [],
    });
    const invalid = oracle.validate({ email: "not-an-email" });
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.errors[0]).toMatchObject({
        instancePath: "/email",
        keyword: "format",
      });
    }
  });

  it("validates JSON Schema draft 2020-12 fixtures", () => {
    const oracle = createSchemaOracle({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 2 } },
    });
    expect(oracle.validate({ name: "Ada" })).toEqual({
      valid: true,
      errors: [],
    });
    expect(oracle.validate({ name: "A" }).valid).toBe(false);
  });
});

describe("policy, outcome classification, minimization, and redaction", () => {
  it("normalizes and enforces exact allowlisted origins", () => {
    expect(normalizeOrigin("HTTPS://EXAMPLE.COM:443/form?q=1")).toBe("https://example.com");
    expect(isTargetAllowed("http://localhost:4173/form", ["http://localhost:4173"])).toBe(true);
    expect(isTargetAllowed("https://example.com.evil.test", ["https://example.com"])).toBe(false);
    expect(() =>
      assertTargetAllowed("https://example.com.evil.test", ["https://example.com"]),
    ).toThrow(AllowlistPolicyError);
    expect(() => normalizeOrigin("file:///tmp/form.html")).toThrow("Only http and https");
  });

  it("distinguishes expected business rejection from a runtime crash", () => {
    expect(
      classifyOutcome("reject", {
        kind: "rejected",
        validationMessages: ["Email is invalid"],
      }),
    ).toBe("expected-rejection");
    expect(
      classifyOutcome("reject", {
        kind: "runtime-crash",
        error: { name: "TypeError", message: "cannot read value" },
      }),
    ).toBe("runtime-crash");
    expect(classifyOutcome("accept", { kind: "accepted" })).toBe("passed");
    expect(classifyOutcome("accept", { kind: "rejected", validationMessages: [] })).toBe(
      "unexpected-rejection",
    );
    expect(classifyOutcome("reject", { kind: "accepted" })).toBe("unexpected-acceptance");
    expect(
      classifyOutcome("observe", {
        kind: "rejected",
        validationMessages: ["record only"],
      }),
    ).toBe("observed");
    expect(classifyOutcome("accept", { kind: "timeout", timeoutMs: 1000 })).toBe("timeout");
    expect(isFailureClassification("passed")).toBe(false);
    for (const classification of [
      "unexpected-acceptance",
      "unexpected-rejection",
      "runtime-crash",
      "timeout",
    ] as const) {
      expect(isFailureClassification(classification)).toBe(true);
    }
    expect(
      failureSignature("runtime-crash", {
        kind: "runtime-crash",
        error: { name: "TypeError", message: "boom" },
      }),
    ).toBe("runtime-crash:TypeError:boom");
    expect(failureSignature("timeout", { kind: "timeout", timeoutMs: 500 })).toBe("timeout:500");
    expect(
      failureSignature("unexpected-rejection", {
        kind: "rejected",
        message: "no",
        validationMessages: ["bad"],
      }),
    ).toBe("unexpected-rejection:bad:no");
    expect(failureSignature("passed", { kind: "accepted" })).toBe("passed:");
  });

  it("rejects malformed policy and minimizer inputs on their explicit branches", async () => {
    expect(() => normalizeOrigin("not a url")).toThrow("Invalid target URL");
    expect(() => normalizeOrigin("https://user:pass@example.test")).toThrow("embedded credentials");
    expect(() => assertTargetAllowed("https://example.test", [])).toThrow("(none)");
    await expect(
      minimizeFailure({ value: "ok" }, () => ({ failed: false }), { maxAttempts: 4 }),
    ).rejects.toThrow("initial input must fail");
    await expect(
      minimizeFailure({ value: "x" }, () => ({ failed: true, signature: "x" }), { maxAttempts: 0 }),
    ).rejects.toThrow("maxAttempts");
  });

  it("minimizes only candidates with the same signature and respects its bound", async () => {
    const result = await minimizeFailure(
      { noise: "remove me", payload: "xxBOOMyy" },
      (candidate) => {
        const payload = candidate.payload;
        if (typeof payload === "string" && payload.includes("BOOM")) {
          return { failed: true, signature: "TypeError:boom" };
        }
        if (typeof payload === "string" && payload.includes("BO")) {
          return { failed: true, signature: "DifferentError" };
        }
        return { failed: false };
      },
      { maxAttempts: 64 },
    );
    expect(result.assignments).toStrictEqual({ payload: "BOOM" });
    expect(result.signature).toBe("TypeError:boom");
    expect(result.attempts).toBeLessThanOrEqual(64);
    expect(result.acceptedReductions).toBeGreaterThan(0);

    const bounded = await minimizeFailure(
      { value: "failure" },
      () => ({ failed: true, signature: "same" }),
      { maxAttempts: 1 },
    );
    expect(bounded.truncated).toBe(true);
    expect(bounded.attempts).toBe(1);
  });

  it("redacts secret-like keys and credential strings without mutating input", () => {
    const input = {
      username: "person",
      password: "hunter2",
      monkey: "banana",
      headers: { authorization: "Bearer secret-value" },
      nested: [{ refreshToken: "token-value" }],
    };
    expect(redactSecrets(input)).toStrictEqual({
      username: "person",
      password: "[REDACTED]",
      monkey: "banana",
      headers: { authorization: "[REDACTED]" },
      nested: [{ refreshToken: "[REDACTED]" }],
    });
    expect(input.password).toBe("hunter2");
  });
});

describe("defensive validation branches", () => {
  it("rejects contradictory field constraints and invalid kind/option combinations", () => {
    for (const constraints of [
      { minLength: 3, maxLength: 2 },
      { minimum: 2, maximum: 1 },
      { exclusiveMinimum: 2, exclusiveMaximum: 2 },
    ]) {
      expect(() => FieldConstraintsSchema.parse(constraints)).toThrow();
    }
    const base = {
      id: "x",
      name: "x",
      label: "X",
      required: false,
      constraints: {},
      provenance: [],
    };
    expect(() => FieldModelSchema.parse({ ...base, kind: "select", options: [] })).toThrow(
      "at least one option",
    );
    expect(() =>
      FieldModelSchema.parse({
        ...base,
        kind: "text",
        options: [{ label: "x", value: "x" }],
      }),
    ).toThrow("only select");
    expect(() =>
      FormModelSchema.parse({
        version: "0.1.0",
        fields: [
          { ...base, kind: "text", options: [] },
          { ...base, kind: "text", options: [] },
        ],
      }),
    ).toThrow("duplicate");
  });

  it("exercises inferred, nullable, boolean, and unsupported schema branches", () => {
    const result = extractFormModel({
      type: "object",
      properties: {
        inferred: {},
        nullable: { type: ["string", "null"], format: "uuid" },
        flag: { type: "boolean" },
      },
    });
    expect(result.form.fields.find((field) => field.id === "flag")).toMatchObject({
      kind: "select",
      options: [
        { label: "true", value: true },
        { label: "false", value: false },
      ],
    });
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["inferred-string-field", "unsupported-format"]),
    );
    expect(() =>
      extractFormModel({
        type: "object",
        properties: { value: { type: ["string", "number"] } },
      }),
    ).toThrow("multi-type unions");
    expect(() =>
      extractFormModel({
        type: "object",
        properties: { value: { type: "string", oneOf: [] } },
      }),
    ).toThrow("oneOf");
  });

  it("surfaces Ajv compilation errors and date range errors", () => {
    expect(() => createSchemaOracle({ type: "definitely-not-a-type" })).toThrow(
      SchemaCompilationError,
    );
    expect(() => addCivilDays("2023-02-29", 1)).toThrow("Invalid civil date");
    expect(() => addCivilDays("9999-12-31", 1)).toThrow("outside");
  });
});

describe("stable report and replay schemas", () => {
  it("validates stable v0.1.0 report and replay payloads and rejects drift", () => {
    const form = model();
    const testCase = firstCase(generateBoundaryCases(form, { seed: 12 }));
    const report = {
      schemaVersion: "1",
      toolVersion: "0.1.0",
      generatedAt: "2026-07-24T00:00:00.000Z",
      seed: 12,
      target: {
        url: "http://localhost:4173/form",
        origin: "http://localhost:4173",
      },
      form,
      summary: {
        total: 1,
        passed: 1,
        expectedRejections: 0,
        observed: 0,
        failures: 0,
        runtimeCrashes: 0,
        timeouts: 0,
      },
      results: [
        {
          case: testCase,
          observed: { kind: "accepted" },
          classification: "passed",
          durationMs: 4,
          findingIds: [],
        },
      ],
      findings: [],
      artifacts: [],
    };
    expect(RunReportSchema.parse(report)).toMatchObject({
      schemaVersion: "1",
      toolVersion: "0.1.0",
    });
    expect(() =>
      RunReportSchema.parse({
        ...report,
        summary: { ...report.summary, total: 2 },
      }),
    ).toThrow("summary.total");

    expect(
      ReplayManifestSchema.parse({
        schemaVersion: "1",
        toolVersion: "0.1.0",
        createdAt: "2026-07-24T00:00:00.000Z",
        seed: 12,
        targetUrl: "http://localhost:4173/form",
        form,
        case: testCase,
        command: ["formstorm", "replay", "case.json"],
      }),
    ).toMatchObject({ seed: 12, case: { id: testCase.id } });
    expect(() =>
      ReplayManifestSchema.parse({
        schemaVersion: "2",
        toolVersion: "0.1.0",
      }),
    ).toThrow();
  });
});
