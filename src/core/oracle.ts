import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

import {
  JsonValueSchema,
  SchemaValidationResultSchema,
  type JsonValue,
  type SchemaValidationIssue,
  type SchemaValidationResult,
} from "./models.js";

export interface SchemaValidityOracle {
  readonly validate: (data: unknown) => SchemaValidationResult;
}

export class SchemaCompilationError extends Error {
  public readonly compilationCause: unknown;

  public constructor(message: string, cause: unknown) {
    super(message);
    this.name = "SchemaCompilationError";
    this.compilationCause = cause;
  }
}

function jsonSafeParams(params: ErrorObject["params"]): JsonValue {
  const serialized = JSON.stringify(params);
  return JsonValueSchema.parse(JSON.parse(serialized) as unknown);
}

function mapIssue(error: ErrorObject): SchemaValidationIssue {
  return {
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed",
    params: jsonSafeParams(error.params),
  };
}

export function createSchemaOracle(schema: unknown): SchemaValidityOracle {
  const dialect =
    typeof schema === "object" &&
    schema !== null &&
    "$schema" in schema &&
    typeof schema.$schema === "string"
      ? schema.$schema
      : "";
  const options = {
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
    validateFormats: true,
  };
  const ajv = dialect.includes("2020-12") ? new Ajv2020(options) : new Ajv(options);
  const installFormats = addFormatsModule.default as unknown as (instance: unknown) => unknown;
  installFormats(ajv);

  let validator: ValidateFunction;
  try {
    validator = ajv.compile(schema as object | boolean);
  } catch (error) {
    throw new SchemaCompilationError(
      `Unable to compile JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  return Object.freeze({
    validate(data: unknown): SchemaValidationResult {
      if (validator(data)) {
        return SchemaValidationResultSchema.parse({ valid: true, errors: [] });
      }
      const errors = (validator.errors ?? []).map(mapIssue);
      return SchemaValidationResultSchema.parse({
        valid: false,
        errors:
          errors.length > 0
            ? errors
            : [
                {
                  instancePath: "",
                  schemaPath: "#",
                  keyword: "unknown",
                  message: "Schema validation failed without Ajv diagnostics",
                  params: {},
                },
              ],
      });
    },
  });
}

export function validateAgainstSchema(schema: unknown, data: unknown): SchemaValidationResult {
  return createSchemaOracle(schema).validate(data);
}
