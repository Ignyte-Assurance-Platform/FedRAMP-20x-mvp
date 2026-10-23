/**
 * The only place that knows FedRAMP schema shapes (ADR-0006 rule 4): the vendored schemas,
 * the ajv validator (compiled once, ADR-0005), the schema-driven problem messages and the
 * answers → Package Overview mapping (WI-007). The rules crosswalk arrives with WI-012.
 */
export { loadVendoredSchemas, SchemaManifestError, SCHEMAS_DIR, type JsonSchema, type VendoredSchemas } from "./schemas";
export { createSchemaValidator, type SchemaValidator } from "./validate";
export { problemsFromSchemaErrors, SchemaNavigator, type FormLabels, type Problem } from "./messages";
export { buildPackageOverview, fallbackPackageId, type PackageOverviewInputs } from "./mapping/package-overview";
export { answerSections, type AnswerLabels, type AnswerRow, type AnswerSection } from "./answer-rows";
export {
  createPackageOverviewGenerator,
  ASSESSOR_NOT_CONFIRMED,
  LOGO_HOST_NOT_CONFIGURED,
  MissingAcronymError,
  packageOverviewFileName,
  todayInNewYork,
  type GeneratedPackageOverview,
  type GenerateInput,
  type LogoCheck,
  type PackageOverviewGenerator,
} from "./package-overview";
