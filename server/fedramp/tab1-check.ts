import { buildPackageOverview } from "./mapping/package-overview";
import { problemsFromSchemaErrors, SchemaNavigator, type FormLabels, type Problem } from "./messages";
import { loadVendoredSchemas, type VendoredSchemas } from "./schemas";
import { createSchemaValidator, type SchemaValidator } from "./validate";

/**
 * Submit check of tab 1 (WI-004 §5): the answers are built into a Package Overview document as
 * Generate JSON would (fallback package ID, no assessor, no advisor added) and validated against
 * the vendored schema, so required fields, enums, formats, the repository if/then rule and the
 * Security + Sales contacts rule all come from the schema itself, named with tab 1's labels.
 * Ignyte-owned parts are not the customer's to fix and are left out: the assessor, and the
 * advisor entry Ignyte adds (the check adds none, so the customer's own advisors are checked).
 * Phone numbers are accepted as typed (§5); their schema pattern is reported on Screen D only.
 */

/** Stands in for the hosted logo address during the check; the real one is set at generation. */
const LOGO_STAND_IN = "https://logo.check.invalid/logo.png";
const NOT_THE_CUSTOMERS = ["/assessor"];
const PHONE = /^\/contactInformation\/\d+\/contactPhone$/;
/** Filled in automatically from provider name + acronym; their own problems say what is missing (2.15). */
const PACKAGE_ID = "/serviceIdentification/fedRampPackageId";

export interface Tab1Checker {
  check(answers: Record<string, unknown>, options: { hasLogo: boolean; labels: FormLabels }): Problem[];
}

export function createTab1Checker(schemas: VendoredSchemas = loadVendoredSchemas()): Tab1Checker {
  const nav = new SchemaNavigator(schemas);
  const validator: SchemaValidator = createSchemaValidator(schemas);
  return {
    check(answers, { hasLogo, labels }) {
      const document = buildPackageOverview({ answers, logoUrl: hasLogo ? LOGO_STAND_IN : null, advisorName: "" });
      const errors = validator.validate(document).filter((e) => !(e.keyword === "pattern" && PHONE.test(e.instancePath)));
      return problemsFromSchemaErrors(nav, errors, labels).filter(
        (p) => p.path !== PACKAGE_ID && !NOT_THE_CUSTOMERS.some((prefix) => p.path === prefix || p.path.startsWith(`${prefix}/`)),
      );
    },
  };
}
