import type { ReaderSummaryNarrativeSection } from "../../domain";
import { optionalString } from "./openai-responses-reader-summary-json";

// Text projection is independent of approved-plan fallback citation admission.
export const narrativeSectionText = (params: {
  readonly value: Record<string, unknown>;
  readonly kind: ReaderSummaryNarrativeSection["kind"] | undefined;
  readonly storyClusterId: string | undefined;
  readonly citationIds: readonly string[];
  readonly legacyExecutiveSummary: string;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): string | undefined =>
  optionalString(params.value.text) ??
  optionalString(params.value.summary) ??
  optionalString(params.value.body) ??
  optionalString(params.value.description) ??
  params.citationIds
    .map((citationId) =>
      optionalString(params.storySummariesByCitationId.get(citationId)),
    )
    .find((value): value is string => value !== undefined) ??
  (params.storyClusterId === undefined
    ? undefined
    : optionalString(
        params.storySummariesByClusterId.get(params.storyClusterId),
      )) ??
  (params.kind === "lead"
    ? optionalString(params.legacyExecutiveSummary)
    : undefined);
