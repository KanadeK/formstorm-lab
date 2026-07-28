import { Faker, en } from "@faker-js/faker";

import {
  BoundaryDimensionSchema,
  FormModelSchema,
  SeedSchema,
  TestCaseSchema,
  type BoundaryDimension,
  type FieldModel,
  type FormAssignments,
  type FormModel,
  type JsonValue,
  type TestCase,
  type TestExpectation,
} from "./models.js";
import type { SchemaValidityOracle } from "./oracle.js";

const MAX_GENERATED_STRING_LENGTH = 4096;

export interface GenerationOptions {
  readonly seed: number;
  readonly dimensions?: readonly BoundaryDimension[];
  readonly oracle?: SchemaValidityOracle;
}

export interface BaselineOptions {
  readonly seed: number;
}

export class BoundaryGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BoundaryGenerationError";
  }
}

function hashSeed(seed: number, key: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function seededFaker(seed: number, key: string): Faker {
  const faker = new Faker({ locale: [en] });
  faker.seed(hashSeed(seed, key));
  return faker;
}

function checkedLength(length: number, field: FieldModel): number {
  if (length > MAX_GENERATED_STRING_LENGTH) {
    throw new BoundaryGenerationError(
      `Field ${field.id} requests a generated string longer than ${String(MAX_GENERATED_STRING_LENGTH)}`,
    );
  }
  return Math.max(0, length);
}

function asciiOfLength(length: number, faker: Faker, field: FieldModel): string {
  const checked = checkedLength(length, field);
  if (checked === 0) {
    return "";
  }
  return faker.string.alpha({ length: checked });
}

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

export function parseCivilDate(input: string): CivilDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  if (match === null) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  return { year, month, day };
}

function formatCivilDate(date: CivilDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function addCivilDays(input: string, delta: number): string {
  const parsed = parseCivilDate(input);
  if (parsed === undefined || !Number.isSafeInteger(delta)) {
    throw new RangeError(`Invalid civil date or day offset: ${input}, ${String(delta)}`);
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day);
  date.setUTCDate(date.getUTCDate() + delta);
  const result = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
  if (result.year < 1 || result.year > 9999) {
    throw new RangeError("Civil date result is outside 0001-01-01 through 9999-12-31");
  }
  return formatCivilDate(result);
}

function baselineForField(field: FieldModel, seed: number): JsonValue {
  if (field.constraints.defaultValue !== undefined) {
    return structuredClone(field.constraints.defaultValue);
  }
  const faker = seededFaker(seed, `baseline:${field.id}`);
  if (field.kind === "select") {
    const option = faker.helpers.arrayElement(field.options);
    return option.value;
  }
  if (field.kind === "number") {
    const lower =
      field.constraints.exclusiveMinimum !== undefined
        ? field.constraints.exclusiveMinimum + (field.constraints.integer === true ? 1 : 0.5)
        : (field.constraints.minimum ?? 0);
    const upper =
      field.constraints.exclusiveMaximum !== undefined
        ? field.constraints.exclusiveMaximum - (field.constraints.integer === true ? 1 : 0.5)
        : (field.constraints.maximum ?? lower + 100);
    if (lower > upper) {
      throw new BoundaryGenerationError(`Field ${field.id} has no numeric baseline`);
    }
    return field.constraints.integer === true
      ? faker.number.int({ min: Math.ceil(lower), max: Math.floor(upper) })
      : faker.number.float({ min: lower, max: upper, fractionDigits: 2 });
  }
  if (field.kind === "date") {
    return field.constraints.minDate ?? "2000-02-29";
  }
  if (field.kind === "email") {
    return `${faker.string.alphanumeric(8).toLowerCase()}@example.test`;
  }
  if (field.kind === "file") {
    return `${faker.string.alphanumeric(8)}.txt`;
  }
  const desired = Math.max(field.constraints.minLength ?? 1, 1);
  const length = Math.min(desired, field.constraints.maxLength ?? desired);
  if (field.constraints.pattern !== undefined) {
    const pattern = new RegExp(field.constraints.pattern, "u");
    const lengths = new Set<number>([
      length,
      field.constraints.minLength ?? length,
      field.constraints.maxLength ?? length,
      1,
      5,
      8,
      12,
      16,
    ]);
    for (const match of field.constraints.pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/gu)) {
      lengths.add(Number(match[1]));
      if (match[2] !== undefined && match[2] !== "") {
        lengths.add(Number(match[2]));
      }
    }
    for (const candidateLength of [...lengths].sort((left, right) => left - right)) {
      if (
        !Number.isInteger(candidateLength) ||
        candidateLength < (field.constraints.minLength ?? 0) ||
        candidateLength > (field.constraints.maxLength ?? 256) ||
        candidateLength > 256
      ) {
        continue;
      }
      const candidates =
        candidateLength === 0
          ? [""]
          : [
              "a".repeat(candidateLength),
              "A".repeat(candidateLength),
              "0".repeat(candidateLength),
              faker.string.alpha(candidateLength),
              faker.string.alphanumeric(candidateLength),
              faker.string.numeric(candidateLength),
            ];
      const match = candidates.find((candidate) => pattern.test(candidate));
      if (match !== undefined) {
        return match;
      }
    }
    throw new BoundaryGenerationError(
      `Field ${field.id} has no deterministic baseline matching its pattern`,
    );
  }
  return asciiOfLength(length, faker, field);
}

export function generateBaselineAssignments(
  formInput: FormModel,
  options: BaselineOptions,
): FormAssignments {
  const form = FormModelSchema.parse(formInput);
  const seed = SeedSchema.parse(options.seed);
  return Object.fromEntries(
    [...form.fields]
      .sort((left, right) => left.id.localeCompare(right.id, "en"))
      .map((field) => [field.name, baselineForField(field, seed)]),
  );
}

function localExpectation(field: FieldModel, value: JsonValue): TestExpectation {
  if (field.kind === "file") {
    return "observe";
  }
  if (field.kind === "select") {
    return field.options.some((option) => Object.is(option.value, value)) ? "accept" : "reject";
  }
  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "reject";
    if (field.constraints.integer === true && !Number.isInteger(value)) return "reject";
    if (field.constraints.minimum !== undefined && value < field.constraints.minimum)
      return "reject";
    if (field.constraints.maximum !== undefined && value > field.constraints.maximum)
      return "reject";
    if (
      field.constraints.exclusiveMinimum !== undefined &&
      value <= field.constraints.exclusiveMinimum
    )
      return "reject";
    if (
      field.constraints.exclusiveMaximum !== undefined &&
      value >= field.constraints.exclusiveMaximum
    )
      return "reject";
    return "accept";
  }
  if (typeof value !== "string") return "reject";
  const length = Array.from(value).length;
  if (field.required && value.length === 0) return "reject";
  if (field.constraints.minLength !== undefined && length < field.constraints.minLength)
    return "reject";
  if (field.constraints.maxLength !== undefined && length > field.constraints.maxLength)
    return "reject";
  if (
    field.constraints.pattern !== undefined &&
    !new RegExp(field.constraints.pattern, "u").test(value)
  )
    return "reject";
  if (field.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return "reject";
  if (field.kind === "date") {
    if (parseCivilDate(value) === undefined) return "reject";
    if (field.constraints.minDate !== undefined && value < field.constraints.minDate)
      return "reject";
    if (field.constraints.maxDate !== undefined && value > field.constraints.maxDate)
      return "reject";
  }
  return "accept";
}

interface Variant {
  readonly dimension: BoundaryDimension;
  readonly variant: string;
  readonly description: string;
  readonly value: JsonValue;
}

function stringVariants(field: FieldModel, seed: number): Variant[] {
  const faker = seededFaker(seed, `strings:${field.id}`);
  const min = field.constraints.minLength ?? 0;
  const max = field.constraints.maxLength;
  const variants: Variant[] = [
    { dimension: "length", variant: "empty", description: "Empty string", value: "" },
    {
      dimension: "unicode",
      variant: "combining",
      description: "Combining Unicode sequence",
      value: `Cafe\u0301-${faker.string.alpha(3)}`,
    },
    {
      dimension: "unicode",
      variant: "emoji",
      description: "Emoji and supplementary-plane input",
      value: `🙂🧪-${faker.string.alpha(3)}`,
    },
    {
      dimension: "rtl",
      variant: "arabic",
      description: "Right-to-left Arabic input",
      value: `مرحبا-${faker.string.alpha(3)}`,
    },
    {
      dimension: "rtl",
      variant: "hebrew",
      description: "Right-to-left Hebrew input",
      value: `שלום-${faker.string.alpha(3)}`,
    },
    {
      dimension: "whitespace",
      variant: "spaces",
      description: "ASCII space-only input",
      value: " ".repeat(faker.number.int({ min: 2, max: 6 })),
    },
    {
      dimension: "whitespace",
      variant: "mixed",
      description: "Mixed tab, newline, and non-breaking space",
      value: "\t\n\u00a0",
    },
  ];
  if (min > 0) {
    variants.push(
      {
        dimension: "length",
        variant: "below-min",
        description: "One code point below minLength",
        value: asciiOfLength(min - 1, faker, field),
      },
      {
        dimension: "length",
        variant: "at-min",
        description: "Exactly minLength code points",
        value: asciiOfLength(min, faker, field),
      },
    );
  }
  if (max !== undefined) {
    variants.push(
      {
        dimension: "length",
        variant: "at-max",
        description: "Exactly maxLength code points",
        value: asciiOfLength(max, faker, field),
      },
      {
        dimension: "length",
        variant: "above-max",
        description: "One code point above maxLength",
        value: asciiOfLength(max + 1, faker, field),
      },
    );
  } else {
    variants.push({
      dimension: "length",
      variant: "long",
      description: "Long unconstrained string",
      value: asciiOfLength(256, faker, field),
    });
  }
  return variants;
}

function fieldVariants(field: FieldModel, seed: number): Variant[] {
  const faker = seededFaker(seed, `variants:${field.id}`);
  if (field.kind === "date") {
    const leapYear = faker.helpers.arrayElement([1996, 2000, 2004, 2024]);
    const variants: Variant[] = [
      {
        dimension: "date",
        variant: "leap-day",
        description: "Valid Gregorian leap day",
        value: `${String(leapYear)}-02-29`,
      },
      {
        dimension: "date",
        variant: "invalid-non-leap-day",
        description: "Invalid Gregorian civil date",
        value: "2023-02-29",
      },
    ];
    if (field.constraints.minDate !== undefined) {
      variants.push(
        {
          dimension: "date",
          variant: "at-min",
          description: "Date at formatMinimum",
          value: field.constraints.minDate,
        },
        {
          dimension: "date",
          variant: "below-min",
          description: "Date before formatMinimum",
          value: addCivilDays(field.constraints.minDate, -1),
        },
      );
    }
    if (field.constraints.maxDate !== undefined) {
      variants.push(
        {
          dimension: "date",
          variant: "at-max",
          description: "Date at formatMaximum",
          value: field.constraints.maxDate,
        },
        {
          dimension: "date",
          variant: "above-max",
          description: "Date after formatMaximum",
          value: addCivilDays(field.constraints.maxDate, 1),
        },
      );
    }
    return variants;
  }
  if (field.kind === "email") {
    return [
      ...stringVariants(field, seed),
      {
        dimension: "email",
        variant: "plus-address",
        description: "Valid plus-addressed email",
        value: `user+${faker.string.alphanumeric(6)}@example.test`,
      },
      {
        dimension: "email",
        variant: "idn-domain",
        description: "Internationalized domain email",
        value: `user@xn--bcher-kva.example`,
      },
      {
        dimension: "email",
        variant: "missing-at",
        description: "Malformed email without at-sign",
        value: `invalid-${faker.string.alphanumeric(5)}.example.test`,
      },
    ];
  }
  if (field.kind === "file") {
    return [
      {
        dimension: "filename",
        variant: "unicode",
        description: "Unicode filename",
        value: `résumé-文件-${faker.string.alphanumeric(4)}.pdf`,
      },
      {
        dimension: "filename",
        variant: "long",
        description: "Long filename",
        value: `${faker.string.alpha({ length: 240 })}.txt`,
      },
      {
        dimension: "filename",
        variant: "path-like",
        description: "Path-like filename",
        value: `..\\${faker.string.alphanumeric(5)}.txt`,
      },
    ];
  }
  if (field.kind === "number") {
    const step = field.constraints.integer === true ? 1 : (field.constraints.multipleOf ?? 0.5);
    const variants: Variant[] = [
      { dimension: "number", variant: "zero", description: "Numeric zero", value: 0 },
      {
        dimension: "number",
        variant: "seeded",
        description: "Seeded finite number",
        value: faker.number.int({ min: -1000, max: 1000 }),
      },
    ];
    if (field.constraints.integer === true) {
      variants.push({
        dimension: "number",
        variant: "fractional",
        description: "Fraction supplied to integer field",
        value: 1.5,
      });
    }
    if (field.constraints.minimum !== undefined) {
      variants.push(
        {
          dimension: "number",
          variant: "at-min",
          description: "Number at minimum",
          value: field.constraints.minimum,
        },
        {
          dimension: "number",
          variant: "below-min",
          description: "Number below minimum",
          value: field.constraints.minimum - step,
        },
      );
    }
    if (field.constraints.maximum !== undefined) {
      variants.push(
        {
          dimension: "number",
          variant: "at-max",
          description: "Number at maximum",
          value: field.constraints.maximum,
        },
        {
          dimension: "number",
          variant: "above-max",
          description: "Number above maximum",
          value: field.constraints.maximum + step,
        },
      );
    }
    return variants;
  }
  if (field.kind === "select") {
    const chosen = faker.helpers.arrayElement(field.options);
    return [
      {
        dimension: "select",
        variant: "valid-option",
        description: "Seeded declared option",
        value: chosen.value,
      },
      {
        dimension: "select",
        variant: "invalid-option",
        description: "Value outside declared options",
        value: `__formstorm_invalid_${faker.string.alphanumeric(6)}__`,
      },
    ];
  }
  return stringVariants(field, seed);
}

export function generateBoundaryCases(
  formInput: FormModel,
  options: GenerationOptions,
): TestCase[] {
  const form = FormModelSchema.parse(formInput);
  const seed = SeedSchema.parse(options.seed);
  const dimensions =
    options.dimensions === undefined
      ? undefined
      : new Set(options.dimensions.map((entry) => BoundaryDimensionSchema.parse(entry)));
  const baseline = generateBaselineAssignments(form, { seed });
  const cases: TestCase[] = [];

  for (const field of [...form.fields].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  )) {
    for (const variant of fieldVariants(field, seed)) {
      if (dimensions !== undefined && !dimensions.has(variant.dimension)) continue;
      const assignments = { ...baseline, [field.name]: variant.value };
      const oracleExpectation =
        options.oracle === undefined
          ? undefined
          : options.oracle.validate(assignments).valid
            ? "accept"
            : "reject";
      cases.push(
        TestCaseSchema.parse({
          id: `${field.id}:${variant.dimension}:${variant.variant}`,
          seed,
          fieldId: field.id,
          dimension: variant.dimension,
          variant: variant.variant,
          description: variant.description,
          assignments,
          expectation: oracleExpectation ?? localExpectation(field, variant.value),
          provenance: field.provenance,
        }),
      );
    }
  }
  return cases;
}
