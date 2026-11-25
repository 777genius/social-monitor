import { readerSummaryNarrativeSectionKinds, type ReaderSummaryNarrativeSection } from "../../domain";
import {
  knownStringSubset,
  normalizeSetValue,
  optionalString,
  requiredStringArray,
} from "./openai-responses-reader-summary-json";
import { defaultNarrativeTitle } from "./openai-responses-reader-summary-narrative-title-policy";
import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-coverage";

const narrativeKinds = new Set(readerSummaryNarrativeSectionKinds);

export type ReaderSummaryProviderNarrativeSection = {
  readonly kind: ReaderSummaryNarrativeSection["kind"] | undefined;
  readonly authoredStoryClusterId: string | undefined;
  readonly storyClusterId: string | undefined;
  readonly title: string | undefined;
  readonly citationIds: readonly string[];
};

/** Anti-corruption boundary: decode untrusted provider fields and bind at most
 * three citations to trusted evidence. Grounding and publication stay downstream. */
export const decodeReaderSummaryProviderNarrativeSection = (
  value: Record<string, unknown>,
  context: {
    readonly coverage: ReaderSummaryNarrativeCoverage;
    readonly knownCitationIds: ReadonlySet<string>;
    readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
  },
): ReaderSummaryProviderNarrativeSection => {
  const kind = normalizeSetValue(
    value.kind,
    narrativeKinds,
    "reader summary narrative kind",
  );
  const authoredStoryClusterId = optionalString(value.storyClusterId);
  const storyClusterId =
    kind === "lead"
      ? context.coverage.mode === "daily_synthesis"
        ? undefined
        : (context.coverage.leadClusterId ?? authoredStoryClusterId)
      : authoredStoryClusterId;
  const title =
    optionalString(value.title) ??
    defaultNarrativeTitle(
      kind,
      storyClusterId,
      context.storyTitlesByClusterId,
      context.coverage.mode,
    );
  const citationIds = knownStringSubset(
    requiredStringArray(
      value.citationIds ?? [],
      "reader summary narrative citations",
    ),
    context.knownCitationIds,
  ).slice(0, 3);
  return { kind, authoredStoryClusterId, storyClusterId, title, citationIds };
};
