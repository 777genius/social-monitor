import type { ReaderSummaryNextAction } from "../../domain";
import { readerObjectSchema, readerStringArraySchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";

/** Typed user action vocabulary, independent of model response transport. */
export const nextActionKinds = new Set<ReaderSummaryNextAction["kind"]>([
  "read_source",
  "watch_repository",
  "monitor_interest",
  "compare_sources",
  "ignore_low_confidence",
  "add_interest_rule",
  "request_deeper_scan",
  "mark_relevant",
  "mark_not_relevant",
]);


export const readerNextActionSchemaDefinition = readerObjectSchema(
    ["kind", "label", "reason", "citationIds", "canonicalUrl"],
    {
      kind: { enum: [...nextActionKinds] },
      label: readerStringSchema(120),
      reason: readerStringSchema(240),
      citationIds: readerStringArraySchema(2),
      canonicalUrl: { type: ["string", "null"] },
    },
  );
