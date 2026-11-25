import type { SchemaNode } from "./gateway-llm-schema-primitives";
import { inspectOutputSchemaViolations } from "./gateway-llm-output-violation-traversal";

export const maxReportedOutputViolations = 12;
/** path:keyword or path:keyword=limit, built from schema names and indices only. */
export const safeOutputViolationPattern = /^\$[A-Za-z0-9_.[\]]{0,160}:[A-Za-z_]{1,32}(?:=\d{1,7})?$/u;

/**
 * Every place a decoded value breaks the gateway output schema, so a repair
 * prompt can name all of them at once. Paths are built from schema property
 * names and array indices; a key the model invented is reported without its
 * name, so no output text reaches feedback or failure reasons. Acceptance
 * stays with the strict decode; this only explains a rejection.
 */
export const collectOutputViolations = (
  schema: SchemaNode, value: unknown, limit = maxReportedOutputViolations,
): readonly string[] => inspectOutputSchemaViolations(schema, value, limit);
