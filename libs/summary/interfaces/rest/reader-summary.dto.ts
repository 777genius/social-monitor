export {
  ReaderSummaryObservedAtRangeDto,
  ReaderSummaryPeriodDto,
  ReaderSummaryScopeDto,
  ReaderSummarySourceWindowDto,
} from "./reader-summary-scope-period.dto";
export {
  ReaderSummaryCitationViewDto,
  ReaderSummaryInterestHighlightDto,
  ReaderSummaryRepeatedSignalDto,
  ReaderSummaryRiskDto,
  ReaderSummaryStoryClusterDto,
  ReaderSummaryStorySignalBreakdownDto,
  ReaderSummaryTopStoryDto,
} from "./reader-summary-evidence.dto";
export {
  ReaderSummaryConfidenceDto,
  ReaderSummaryContextArtifactDto,
  ReaderSummaryFreshnessDto,
  ReaderSummaryLineageDto,
  ReaderSummaryPersonalizationDto,
  ReaderSummaryUsageDto,
} from "./reader-summary-metadata.dto";
export {
  ReaderSummaryCoverageSummaryDto,
  ReaderSummaryProviderCoverageDto,
} from "./reader-summary-coverage.dto";
export {
  ListReaderSummariesResponseDto,
  ListReaderSummaryPeriodsResponseDto,
  ReaderSummaryArtifactResponseDto,
  ReaderSummaryPeriodSummaryDto,
  ReaderSummaryResponseDto,
} from "./reader-summary-response.dto";
export {
  DecideReaderSummaryTopicRecommendationRequestDto,
  DecideReaderSummaryTopicRecommendationResponseDto,
  ListReaderSummaryTopicRecommendationsResponseDto,
  ReaderSummaryTopicRecommendationDecisionDto,
  ReaderSummaryTopicRecommendationDto,
  ReaderSummaryTopicRecommendationMetricsDto,
} from "./reader-summary-topic-recommendation.dto";

// Compatibility facade for existing REST imports. Canonical readerSummaryId is
// declared on ReaderSummaryArtifactResponseDto in reader-summary-response.dto.ts.
