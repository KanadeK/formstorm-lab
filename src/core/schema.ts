import {
  CORE_SCOPE_VERSION,
  FormModelSchema,
  JsonValueSchema,
  SchemaDiagnosticSchema,
  type ConstraintProvenance,
  type FieldConstraints,
  type FieldKind,
  type FieldModel,
  type FieldOption,
  type FormModel,
  type JsonValue,
  type SchemaDiagnostic,
} from "./models.js";

export const V0_1_SCHEMA_SCOPE = Object.freeze({
  version: CORE_SCOPE_VERSION,
  root: "A JSON Schema object with direct scalar properties",
  references: "Local JSON Pointer references only",
  fieldTypes: ["string", "number", "integer", "boolean"] as const,
  stringFormats: ["email", "date", "binary"] as const,
  constraints: [
    "required",
    "enum",
    "const",
    "default",
    "examples",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "formatMinimum",
    "formatMaximum",
  ] as const,
  unsupported: [
    "External references",
    "Recursive references",
    "Nested object fields",
    "Array fields",
    "Schema composition and conditionals",
    "Remote schema loading",
  ] as const,
});

export interface ExtractFormModelOptions {
  readonly unsupported?: "error" | "diagnostic";
}

export interface ExtractionResult {
  readonly form: FormModel;
  readonly diagnostics: readonly SchemaDiagnostic[];
}

export class SchemaExtractionError extends Error {
  public readonly diagnostic: SchemaDiagnostic;

  public constructor(diagnostic: SchemaDiagnostic) {
    super(diagnostic.message);
    this.name = "SchemaExtractionError";
    this.diagnostic = SchemaDiagnosticSchema.parse(diagnostic);
  }
}

export class UnsupportedSchemaError extends SchemaExtractionError {
  public constructor(diagnostic: SchemaDiagnostic) {
    super(diagnostic);
    this.name = "UnsupportedSchemaError";
  }
}

const UNSUPPORTED_KEYWORDS = [
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "patternProperties",
  "unevaluatedProperties",
  "contains",
  "prefixItems",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function propertyPath(name: string): string {
  return `#/properties/${escapePointerToken(name)}`;
}

function diagnostic(
  code: string,
  severity: SchemaDiagnostic["severity"],
  path: string,
  message: string,
  keyword?: string,
): SchemaDiagnostic {
  return SchemaDiagnosticSchema.parse({
    code,
    severity,
    path,
    message,
    ...(keyword === undefined ? {} : { keyword }),
  });
}

function extractionError(
  code: string,
  path: string,
  message: string,
  keyword?: string,
): SchemaExtractionError {
  return new SchemaExtractionError(diagnostic(code, "error", path, message, keyword));
}

function unsupportedError(
  code: string,
  path: string,
  message: string,
  keyword?: string,
): UnsupportedSchemaError {
  return new UnsupportedSchemaError(diagnostic(code, "error", path, message, keyword));
}

function decodePointerToken(token: string, ref: string): string {
  if (/~(?:[^01]|$)/u.test(token)) {
    throw unsupportedError(
      "invalid-local-ref",
      ref,
      `Local reference contains an invalid JSON Pointer escape: ${ref}`,
      "$ref",
    );
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(root: unknown, ref: string): unknown {
  if (ref === "#") {
    return root;
  }
  if (!ref.startsWith("#/")) {
    throw unsupportedError(
      "unsupported-ref",
      ref,
      `v0.1.0 supports local JSON Pointer references only: ${ref}`,
      "$ref",
    );
  }

  let current: unknown = root;
  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => decodePointerToken(segment, ref));

  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment)) {
        throw unsupportedError(
          "invalid-local-ref",
          ref,
          `Local reference does not resolve: ${ref}`,
          "$ref",
        );
      }
      current = current[Number(segment)];
      continue;
    }
    if (!isRecord(current) || !hasOwn(current, segment)) {
      throw unsupportedError(
        "invalid-local-ref",
        ref,
        `Local reference does not resolve: ${ref}`,
        "$ref",
      );
    }
    current = current[segment];
  }

  if (current === undefined) {
    throw unsupportedError(
      "invalid-local-ref",
      ref,
      `Local reference does not resolve: ${ref}`,
      "$ref",
    );
  }
  return current;
}

function resolveNode(
  node: unknown,
  root: unknown,
  path: string,
  seenRefs: ReadonlySet<string> = new Set<string>(),
): Record<string, unknown> {
  if (!isRecord(node)) {
    throw extractionError("invalid-schema-node", path, `Schema node at ${path} must be an object`);
  }

  if (typeof node.$ref !== "string") {
    if (node.$ref !== undefined) {
      throw extractionError("invalid-ref", `${path}/$ref`, "$ref must be a string", "$ref");
    }
    return node;
  }

  const ref = node.$ref;
  if (!ref.startsWith("#")) {
    throw unsupportedError(
      "unsupported-ref",
      `${path}/$ref`,
      `External references are outside the v0.1.0 scope: ${ref}`,
      "$ref",
    );
  }
  if (seenRefs.has(ref)) {
    throw unsupportedError(
      "recursive-ref",
      `${path}/$ref`,
      `Recursive local reference is outside the v0.1.0 scope: ${ref}`,
      "$ref",
    );
  }

  const nextSeen = new Set(seenRefs);
  nextSeen.add(ref);
  const resolved = resolveNode(resolvePointer(root, ref), root, ref, nextSeen);
  const siblings = Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$ref"));
  return { ...resolved, ...siblings };
}

function readOptionalString(
  node: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  const value = node[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw extractionError("invalid-keyword", `${path}/${key}`, `${key} must be a string`, key);
  }
  return value;
}

function readOptionalFiniteNumber(
  node: Record<string, unknown>,
  key: string,
  path: string,
): number | undefined {
  const value = node[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw extractionError(
      "invalid-keyword",
      `${path}/${key}`,
      `${key} must be a finite number`,
      key,
    );
  }
  return value;
}

function readOptionalNonNegativeInteger(
  node: Record<string, unknown>,
  key: string,
  path: string,
): number | undefined {
  const value = readOptionalFiniteNumber(node, key, path);
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw extractionError(
      "invalid-keyword",
      `${path}/${key}`,
      `${key} must be a non-negative integer`,
      key,
    );
  }
  return value;
}

function readJsonValue(value: unknown, path: string, keyword: string): JsonValue {
  const parsed = JsonValueSchema.safeParse(value);
  if (!parsed.success) {
    throw extractionError("invalid-keyword", path, `${keyword} must contain a JSON value`, keyword);
  }
  return parsed.data;
}

function effectiveType(node: Record<string, unknown>, path: string): string | undefined {
  const value = node.type;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw extractionError(
      "invalid-type",
      `${path}/type`,
      "type must be a string or a string array",
      "type",
    );
  }
  const concrete = value.filter(
    (entry): entry is string => typeof entry === "string" && entry !== "null",
  );
  if (concrete.length !== 1) {
    throw unsupportedError(
      "unsupported-union-type",
      `${path}/type`,
      "v0.1.0 supports nullable scalar types but not multi-type unions",
      "type",
    );
  }
  return concrete[0];
}

function optionLabel(value: FieldOption["value"]): string {
  if (value === null) {
    return "null";
  }
  return String(value);
}

function extractOptions(node: Record<string, unknown>, path: string): FieldOption[] | undefined {
  let values: unknown[] | undefined;
  if (hasOwn(node, "enum")) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) {
      throw extractionError(
        "invalid-enum",
        `${path}/enum`,
        "enum must be a non-empty array",
        "enum",
      );
    }
    values = node.enum;
  } else if (hasOwn(node, "const")) {
    values = [node.const];
  }

  if (values === undefined) {
    return undefined;
  }

  const options: FieldOption[] = values.map((value, index) => {
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw unsupportedError(
        "unsupported-enum-value",
        `${path}/enum/${String(index)}`,
        "v0.1.0 select options must be strings, numbers, booleans, or null",
        "enum",
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw extractionError(
        "invalid-enum-value",
        `${path}/enum/${String(index)}`,
        "enum numbers must be finite",
        "enum",
      );
    }
    return { value, label: optionLabel(value) };
  });

  const serialized = new Set(options.map(({ value }) => JSON.stringify(value)));
  if (serialized.size !== options.length) {
    throw extractionError(
      "duplicate-enum-value",
      `${path}/enum`,
      "enum values must be unique",
      "enum",
    );
  }
  return options;
}

function provenanceFor(
  constraint: string,
  path: string,
  keyword = constraint,
): ConstraintProvenance {
  return {
    constraint,
    origin: "json-schema",
    sourcePath: `${path}/${keyword}`,
    keyword,
  };
}

function extractConstraints(
  node: Record<string, unknown>,
  path: string,
  kind: FieldKind,
): { constraints: FieldConstraints; provenance: ConstraintProvenance[] } {
  const constraints: FieldConstraints = {};
  const provenance: ConstraintProvenance[] = [];

  const assignNumber = (
    key: "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf",
  ): void => {
    const value = readOptionalFiniteNumber(node, key, path);
    if (value !== undefined) {
      constraints[key] = value;
      provenance.push(provenanceFor(key, path));
    }
  };

  const minLength = readOptionalNonNegativeInteger(node, "minLength", path);
  if (minLength !== undefined) {
    constraints.minLength = minLength;
    provenance.push(provenanceFor("minLength", path));
  }
  const maxLength = readOptionalNonNegativeInteger(node, "maxLength", path);
  if (maxLength !== undefined) {
    constraints.maxLength = maxLength;
    provenance.push(provenanceFor("maxLength", path));
  }

  assignNumber("minimum");
  assignNumber("maximum");
  assignNumber("exclusiveMinimum");
  assignNumber("exclusiveMaximum");
  assignNumber("multipleOf");

  if (constraints.multipleOf !== undefined && constraints.multipleOf <= 0) {
    throw extractionError(
      "invalid-keyword",
      `${path}/multipleOf`,
      "multipleOf must be greater than zero",
      "multipleOf",
    );
  }

  const pattern = readOptionalString(node, "pattern", path);
  if (pattern !== undefined) {
    try {
      new RegExp(pattern, "u");
    } catch {
      throw extractionError(
        "invalid-pattern",
        `${path}/pattern`,
        "pattern must be a valid ECMAScript regular expression",
        "pattern",
      );
    }
    constraints.pattern = pattern;
    provenance.push(provenanceFor("pattern", path));
  }

  if (kind === "number" && effectiveType(node, path) === "integer") {
    constraints.integer = true;
    provenance.push(provenanceFor("integer", path, "type"));
  }

  if (kind === "email") {
    constraints.format = "email";
    provenance.push(provenanceFor("format", path));
  } else if (kind === "date") {
    constraints.format = "date";
    provenance.push(provenanceFor("format", path));
    const minDate = readOptionalString(node, "formatMinimum", path);
    if (minDate !== undefined) {
      constraints.minDate = minDate;
      provenance.push(provenanceFor("minDate", path, "formatMinimum"));
    }
    const maxDate = readOptionalString(node, "formatMaximum", path);
    if (maxDate !== undefined) {
      constraints.maxDate = maxDate;
      provenance.push(provenanceFor("maxDate", path, "formatMaximum"));
    }
  } else if (kind === "file") {
    constraints.format = "binary";
    provenance.push(provenanceFor("format", path));
  }

  if (hasOwn(node, "default")) {
    constraints.defaultValue = readJsonValue(node.default, `${path}/default`, "default");
    provenance.push(provenanceFor("defaultValue", path, "default"));
  }
  if (hasOwn(node, "examples")) {
    if (!Array.isArray(node.examples)) {
      throw extractionError(
        "invalid-keyword",
        `${path}/examples`,
        "examples must be an array",
        "examples",
      );
    }
    constraints.examples = node.examples.map((value, index) =>
      readJsonValue(value, `${path}/examples/${String(index)}`, "examples"),
    );
    provenance.push(provenanceFor("examples", path));
  }

  return { constraints, provenance };
}

function inferKind(
  node: Record<string, unknown>,
  path: string,
  options: FieldOption[] | undefined,
  diagnostics: SchemaDiagnostic[],
): FieldKind {
  if (options !== undefined) {
    return "select";
  }

  const type = effectiveType(node, path);
  if (type === "number" || type === "integer") {
    return "number";
  }
  if (type === "boolean") {
    return "select";
  }
  if (type === "array") {
    throw unsupportedError(
      "unsupported-array-field",
      `${path}/type`,
      "Array fields are outside the v0.1.0 scope",
      "type",
    );
  }
  if (type === "object" || hasOwn(node, "properties")) {
    throw unsupportedError(
      "unsupported-nested-object",
      `${path}/type`,
      "Nested object fields are outside the v0.1.0 scope",
      "type",
    );
  }
  if (type !== undefined && type !== "string") {
    throw unsupportedError(
      "unsupported-field-type",
      `${path}/type`,
      `Field type is outside the v0.1.0 scope: ${type}`,
      "type",
    );
  }

  const format = readOptionalString(node, "format", path);
  if (format === "email") {
    return "email";
  }
  if (format === "date") {
    return "date";
  }
  if (
    format === "binary" ||
    typeof node.contentMediaType === "string" ||
    node.contentEncoding === "binary"
  ) {
    return "file";
  }
  if (format !== undefined) {
    diagnostics.push(
      diagnostic(
        "unsupported-format",
        "warning",
        `${path}/format`,
        `Format is retained as a text field in v0.1.0: ${format}`,
        "format",
      ),
    );
  }
  if (type === undefined) {
    diagnostics.push(
      diagnostic(
        "inferred-string-field",
        "info",
        path,
        "Missing type was inferred as string",
        "type",
      ),
    );
  }
  return "text";
}

function extractField(
  name: string,
  rawNode: unknown,
  root: unknown,
  required: ReadonlySet<string>,
  diagnostics: SchemaDiagnostic[],
): FieldModel {
  const path = propertyPath(name);
  const node = resolveNode(rawNode, root, path);

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (hasOwn(node, keyword)) {
      throw unsupportedError(
        "unsupported-keyword",
        `${path}/${keyword}`,
        `Schema keyword is outside the v0.1.0 scope: ${keyword}`,
        keyword,
      );
    }
  }

  let options = extractOptions(node, path);
  const type = effectiveType(node, path);
  if (type === "boolean" && options === undefined) {
    options = [
      { label: "true", value: true },
      { label: "false", value: false },
    ];
  }

  const kind = inferKind(node, path, options, diagnostics);
  const extracted = extractConstraints(node, path, kind);
  const isRequired = required.has(name);
  if (isRequired) {
    extracted.provenance.unshift({
      constraint: "required",
      origin: "json-schema",
      sourcePath: "#/required",
      keyword: "required",
    });
  }

  const title = readOptionalString(node, "title", path);
  return {
    id: name,
    name,
    label: title ?? name,
    kind,
    required: isRequired,
    constraints: extracted.constraints,
    options: options ?? [],
    provenance: extracted.provenance,
  };
}

function parseRequired(root: Record<string, unknown>): Set<string> {
  if (root.required === undefined) {
    return new Set<string>();
  }
  if (!Array.isArray(root.required) || root.required.some((entry) => typeof entry !== "string")) {
    throw extractionError(
      "invalid-required",
      "#/required",
      "required must be an array of property names",
      "required",
    );
  }
  const names = root.required as string[];
  if (new Set(names).size !== names.length) {
    throw extractionError(
      "duplicate-required",
      "#/required",
      "required property names must be unique",
      "required",
    );
  }
  return new Set(names);
}

export function extractFormModel(
  schema: unknown,
  options: ExtractFormModelOptions = {},
): ExtractionResult {
  if (!isRecord(schema)) {
    throw extractionError("invalid-root-schema", "#", "The JSON Schema root must be an object");
  }

  const unsupportedMode = options.unsupported ?? "error";
  const diagnostics: SchemaDiagnostic[] = [];
  const root = resolveNode(schema, schema, "#");
  const rootType = effectiveType(root, "#");
  if (rootType !== undefined && rootType !== "object") {
    throw extractionError(
      "invalid-root-type",
      "#/type",
      "The JSON Schema root must have type object",
      "type",
    );
  }
  if (!isRecord(root.properties)) {
    throw extractionError(
      "missing-properties",
      "#/properties",
      "The JSON Schema root must define a properties object",
      "properties",
    );
  }

  const required = parseRequired(root);
  for (const requiredName of [...required].sort()) {
    if (!hasOwn(root.properties, requiredName)) {
      diagnostics.push(
        diagnostic(
          "unknown-required-property",
          "warning",
          "#/required",
          `required names a property that is not defined: ${requiredName}`,
          "required",
        ),
      );
    }
  }

  const fields: FieldModel[] = [];
  for (const name of Object.keys(root.properties).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    try {
      fields.push(extractField(name, root.properties[name], schema, required, diagnostics));
    } catch (error) {
      if (error instanceof UnsupportedSchemaError && unsupportedMode === "diagnostic") {
        diagnostics.push(error.diagnostic);
        continue;
      }
      throw error;
    }
  }

  if (fields.length === 0) {
    throw extractionError(
      "no-supported-fields",
      "#/properties",
      "No fields in the schema are supported by the v0.1.0 scope",
      "properties",
    );
  }

  const id = readOptionalString(root, "$id", "#");
  const title = readOptionalString(root, "title", "#");
  const form = FormModelSchema.parse({
    version: CORE_SCOPE_VERSION,
    ...(id === undefined ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    fields,
  });

  return {
    form,
    diagnostics: diagnostics
      .map((entry) => SchemaDiagnosticSchema.parse(entry))
      .sort(
        (left, right) =>
          left.path.localeCompare(right.path, "en") || left.code.localeCompare(right.code, "en"),
      ),
  };
}
