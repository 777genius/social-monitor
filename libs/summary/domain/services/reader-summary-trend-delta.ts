import type { SourceMixEntry } from "../entities/source-mix-entry";
import type {
  InterestHighlight,
  ReaderTrendDelta,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
} from "../entities/top-read";
import { compactUnique, interestTitle, plural, uniqueNonEmpty } from "../value-objects/summary-text";
import { providerNameForKey } from "../aggregates/reader-summary-open-questions";

export const buildReaderSummaryTrendDelta = (params: {
  readonly interestHighlights: readonly InterestHighlight[];
  readonly topStories: readonly TopReadCandidate[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly topReads: readonly TopRead[];
  readonly sourceMix: readonly SourceMixEntry[];
}): ReaderTrendDelta => {
  const interestSignals = uniqueNonEmpty([
    ...params.interestHighlights.map((highlight) => highlight.title),
    ...params.topStories.flatMap((story) =>
      story.interestIds.map(interestTitle),
    ),
  ]);
  const totalReads = params.topReads.length;
  const newSignal = totalReads === 0
    ? undefined
    : params.sourceMix.length === 1
      ? `${totalReads} ${providerNameForKey(params.sourceMix[0]?.providerKey, params.topReads)} item${plural(totalReads)} selected`
      : `${totalReads} ${sourceMixSignalLabel(params.sourceMix)} item${plural(totalReads)} selected`;
  return {
    newSignals: compactUnique([newSignal]),
    growingSignals: interestSignals.slice(0, 3),
    repeatedSignals: params.repeatedSignals.slice(0, 3).map((signal) => signal.title),
    fadingSignals: [],
  };
};

const sourceMixSignalLabel = (sourceMix: readonly SourceMixEntry[]): string =>
  sourceMix.some((source) => source.crossSourceClusterCount > 0)
    ? "cross-source"
    : "multi-source";
