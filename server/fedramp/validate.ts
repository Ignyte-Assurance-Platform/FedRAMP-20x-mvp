import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { VendoredSchemas } from "./schemas";

/**
 * Step 1 of WI-007 §5: the vendored Package Overview schema (draft 2020-12) with Common
 * Definitions registered and format checks on. Compiled once per set of schemas (ADR-0005).
 */
export interface SchemaValidator {
  validate(document: unknown): ErrorObject[];
}

export function createSchemaValidator(schemas: VendoredSchemas): SchemaValidator {
  const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true });
  addFormats(ajv, ["uri", "email", "date", "date-time"]);
  ajv.addSchema(schemas.commonDefinitions);
  const compiled: ValidateFunction = ajv.compile(schemas.packageOverview);
  return {
    validate(document) {
      return compiled(document) ? [] : [...(compiled.errors ?? [])];
    },
  };
}
