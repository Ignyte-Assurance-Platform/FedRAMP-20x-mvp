/**
 * The only place that knows FedRAMP schema shapes (ADR-0006 rule 4). Schemas, the ajv
 * validators (compiled once, ADR-0005) and the answers → Package Overview mapping arrive
 * with WI-007 and WI-012; WI-010 only creates the module and its ~server/fedramp alias.
 */
export {};
