import type {
  ConstraintName,
  DomField,
  DomForm,
  JsonSchema,
  MergedFieldModel,
  MergedFormModel,
  ValidationMismatch,
} from "./types.js";

function comparable(value: unknown): string {
  return JSON.stringify(value);
}

function addMismatch(
  mismatches: ValidationMismatch[],
  field: string,
  constraint: ConstraintName,
  schemaValue: unknown,
  domValue: unknown,
  dom: DomField | undefined,
): void {
  if (comparable(schemaValue) === comparable(domValue)) {
    return;
  }
  mismatches.push({
    constraint,
    domValue,
    field,
    ...(dom === undefined ? {} : { locator: dom.locator }),
    message: `${field}.${constraint} differs: schema=${comparable(schemaValue)}, DOM=${comparable(domValue)}`,
    schemaValue,
  });
}

function expectedInputType(schema: JsonSchema): string | undefined {
  if (schema.format === "email") return "email";
  if (schema.format === "date") return "date";
  if (schema.type === "number" || schema.type === "integer") return "number";
  return undefined;
}

export function mergeSchemaAndDom(schema: JsonSchema, forms: readonly DomForm[]): MergedFormModel {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const allDomFields = forms.flatMap((form) => form.fields);
  const fields: MergedFieldModel[] = [];
  const mismatches: ValidationMismatch[] = [];

  for (const [name, property] of Object.entries(properties)) {
    const dom = allDomFields.find((candidate) => candidate.name === name);
    fields.push({
      ...(dom === undefined ? {} : { dom }),
      name,
      requiredBySchema: required.has(name),
      schema: property,
    });
    if (dom === undefined) {
      addMismatch(mismatches, name, "type", property.type ?? "present", "missing", undefined);
      continue;
    }
    addMismatch(mismatches, name, "required", required.has(name), dom.constraints.required, dom);
    for (const constraint of ["minLength", "maxLength", "pattern"] as const) {
      const schemaValue = property[constraint];
      const domValue = dom.constraints[constraint];
      if (schemaValue !== undefined || domValue !== undefined) {
        addMismatch(mismatches, name, constraint, schemaValue ?? null, domValue ?? null, dom);
      }
    }
    if (property.enum !== undefined && dom.options !== undefined) {
      addMismatch(mismatches, name, "enum", [...property.enum], [...dom.options], dom);
    }
    const inputType = expectedInputType(property);
    if (inputType !== undefined) {
      addMismatch(mismatches, name, "format", inputType, dom.inputType, dom);
    }
    if (property.minimum !== undefined || dom.constraints.min !== undefined) {
      addMismatch(
        mismatches,
        name,
        "minimum",
        property.minimum ?? null,
        dom.constraints.min === undefined ? null : Number(dom.constraints.min),
        dom,
      );
    }
    if (property.maximum !== undefined || dom.constraints.max !== undefined) {
      addMismatch(
        mismatches,
        name,
        "maximum",
        property.maximum ?? null,
        dom.constraints.max === undefined ? null : Number(dom.constraints.max),
        dom,
      );
    }
  }

  return {
    fields,
    forms,
    mismatches,
    ...(schema.title === undefined ? {} : { schemaTitle: schema.title }),
  };
}

export function minimalMismatchInput(mismatch: ValidationMismatch): string {
  if (mismatch.constraint === "minLength" && typeof mismatch.schemaValue === "number") {
    return "a".repeat(Math.max(0, mismatch.schemaValue));
  }
  if (mismatch.constraint === "maxLength" && typeof mismatch.domValue === "number") {
    return "a".repeat(Math.max(0, mismatch.domValue + 1));
  }
  if (mismatch.constraint === "required") {
    return "";
  }
  if (mismatch.constraint === "enum" && Array.isArray(mismatch.schemaValue)) {
    const first = mismatch.schemaValue.find((value) => typeof value === "string");
    return typeof first === "string" ? first : "";
  }
  return JSON.stringify(mismatch.schemaValue ?? "");
}
