import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";

import type { FixtureBusinessCase, FixtureProfile, JsonSchema, LoadedJsonSchema } from "./types.js";

export class SchemaFileError extends Error {
  public readonly code: "INVALID_JSON" | "INVALID_SCHEMA" | "READ_FAILED";

  public constructor(code: SchemaFileError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SchemaFileError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSchema(value: unknown, path: string): asserts value is JsonSchema {
  if (!isRecord(value)) {
    throw new SchemaFileError("INVALID_SCHEMA", `Schema at ${path} must be a JSON object.`);
  }

  if ("properties" in value && !isRecord(value.properties)) {
    throw new SchemaFileError(
      "INVALID_SCHEMA",
      `Schema "properties" at ${path} must be an object.`,
    );
  }
  if ("required" in value && !Array.isArray(value.required)) {
    throw new SchemaFileError("INVALID_SCHEMA", `Schema "required" at ${path} must be an array.`);
  }
}

export async function loadJsonSchema(schemaPath: string): Promise<LoadedJsonSchema> {
  const absolutePath = resolve(schemaPath);
  let sourceText: string;
  try {
    sourceText = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new SchemaFileError("READ_FAILED", `Unable to read schema file at ${absolutePath}.`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText) as unknown;
  } catch (error) {
    throw new SchemaFileError("INVALID_JSON", `Schema file at ${absolutePath} is not valid JSON.`, {
      cause: error,
    });
  }

  assertSchema(parsed, absolutePath);
  return { absolutePath, schema: parsed, sourceText };
}

function assertStringMap(value: unknown, context: string): asserts value is Record<string, string> {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new SchemaFileError("INVALID_SCHEMA", `${context} must map names to strings.`);
  }
}

function parseBusinessCase(value: unknown, index: number): FixtureBusinessCase {
  if (!isRecord(value)) {
    throw new SchemaFileError(
      "INVALID_SCHEMA",
      `Fixture profile businessCases[${String(index)}] must be an object.`,
    );
  }
  const { expectedMessage, expectedOutcome, name, values } = value;
  if (
    typeof expectedMessage !== "string" ||
    (expectedOutcome !== "accepted" && expectedOutcome !== "rejected") ||
    typeof name !== "string"
  ) {
    throw new SchemaFileError(
      "INVALID_SCHEMA",
      `Fixture profile businessCases[${String(index)}] has invalid metadata.`,
    );
  }
  assertStringMap(values, `Fixture profile businessCases[${String(index)}].values`);
  return { expectedMessage, expectedOutcome, name, values };
}

export async function loadFixtureProfile(profilePath: string): Promise<FixtureProfile> {
  const absolutePath = resolve(profilePath);
  let sourceText: string;
  try {
    sourceText = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new SchemaFileError("READ_FAILED", `Unable to read fixture profile at ${absolutePath}.`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText) as unknown;
  } catch (error) {
    throw new SchemaFileError(
      "INVALID_JSON",
      `Fixture profile at ${absolutePath} is not valid JSON.`,
      { cause: error },
    );
  }

  if (!isRecord(parsed)) {
    throw new SchemaFileError("INVALID_SCHEMA", "Fixture profile must be an object.");
  }
  const { businessCases, defaults, formSelector, id, statusSelector } = parsed;
  if (
    typeof formSelector !== "string" ||
    typeof id !== "string" ||
    typeof statusSelector !== "string"
  ) {
    throw new SchemaFileError(
      "INVALID_SCHEMA",
      "Fixture profile id, formSelector, and statusSelector must be strings.",
    );
  }
  assertStringMap(defaults, "Fixture profile defaults");

  if (businessCases === undefined) {
    return { defaults, formSelector, id, statusSelector };
  }
  if (!Array.isArray(businessCases)) {
    throw new SchemaFileError("INVALID_SCHEMA", "Fixture profile businessCases must be an array.");
  }
  return {
    businessCases: businessCases.map((entry, index) => parseBusinessCase(entry, index)),
    defaults,
    formSelector,
    id,
    statusSelector,
  };
}

export async function findSiblingFixtureProfile(schemaPath: string): Promise<string | undefined> {
  const candidate = resolve(dirname(resolve(schemaPath)), "profile.json");
  try {
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return undefined;
  }
}
