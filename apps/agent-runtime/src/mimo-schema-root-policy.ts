import { MIMO_QUALIFIED_HEADLINE_CONTRACT } from "@social-monitor/summary/domain";
import { mimoSchemaMarkers } from "./reader-summary-mimo-schema-markers";

export const assertMimoSchemaRoot = (
  purpose: string,
  schema: Record<string, unknown>,
): void => {
  const markers = mimoSchemaMarkers[purpose]?.[2];
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as readonly string[] | undefined;
  const versioned = purpose === "social_monitor.reader_summary.promotion_presentation.v3" &&
    properties !== undefined && Object.hasOwn(properties, "contractVersion");
  const expected = versioned ? ["presentations", "contractVersion"] : markers;
  const version = properties?.contractVersion as Record<string, unknown> | undefined;
  if (versioned && (Object.keys(properties!).length !== 2 || !version || typeof version !== "object" || Array.isArray(version)
    || Object.keys(version).length !== 2 || version.type !== "string" || version.const !== MIMO_QUALIFIED_HEADLINE_CONTRACT)) {
    throw new Error("outputSchema conflicts with MiMo purpose policy");
  }
  const first = expected?.[0];
  const firstSchema = first === undefined ? undefined : properties?.[first] as Record<string, unknown> | undefined;
  if (expected === undefined || schema.type !== "object" || schema.additionalProperties !== false ||
    !properties || Array.isArray(properties) || !Array.isArray(required) ||
    required.length !== expected?.length ||
    expected.some((key) => !required.includes(key) || !Object.hasOwn(properties, key)) ||
    firstSchema?.type !== (first === "headline" ? "string" : "array")) {
    throw new Error("outputSchema conflicts with MiMo purpose policy");
  }
};
