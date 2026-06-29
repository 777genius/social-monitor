import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class PlanInterestCoverageApiRequestDto {
  const PlanInterestCoverageApiRequestDto({
    required this.scope,
    required this.interestId,
    this.description,
    this.keywords = const [],
    this.subreddits = const [],
    this.rssFeedUrls = const [],
    this.includeProviders = const [],
    this.excludeProviders = const [],
  });

  final WorkspaceScope scope;
  final String interestId;
  final String? description;
  final List<String> keywords;
  final List<String> subreddits;
  final List<String> rssFeedUrls;
  final List<String> includeProviders;
  final List<String> excludeProviders;
}

final class InterestCoveragePlanApiDto {
  const InterestCoveragePlanApiDto({
    required this.interestId,
    required this.interestTitle,
    required this.planningQuery,
    required this.normalizedKeywords,
    required this.drafts,
    required this.coverageGaps,
    required this.skippedProviders,
  });

  final String interestId;
  final String interestTitle;
  final String planningQuery;
  final List<String> normalizedKeywords;
  final List<InterestCoveragePlanDraftApiDto> drafts;
  final List<String> coverageGaps;
  final List<InterestCoveragePlanSkippedProviderApiDto> skippedProviders;
}

final class InterestCoveragePlanDraftApiDto {
  const InterestCoveragePlanDraftApiDto({
    required this.providerKey,
    required this.displayName,
    required this.status,
    required this.confidenceScore,
    required this.priority,
    required this.targetContentUnits,
    required this.queryModes,
    required this.rationale,
    required this.warnings,
    required this.alternativeDrafts,
    this.sourceBindingDraft,
    this.existingSourceBindingId,
    this.cadenceSuggestion,
  });

  final String providerKey;
  final String displayName;
  final String status;
  final num confidenceScore;
  final num priority;
  final List<String> targetContentUnits;
  final List<String> queryModes;
  final List<String> rationale;
  final List<String> warnings;
  final InterestCoveragePlanBindingDraftApiDto? sourceBindingDraft;
  final String? existingSourceBindingId;
  final InterestCoveragePlanCadenceSuggestionApiDto? cadenceSuggestion;
  final List<InterestCoveragePlanAlternativeDraftApiDto> alternativeDrafts;
}

final class InterestCoveragePlanBindingDraftApiDto {
  const InterestCoveragePlanBindingDraftApiDto({
    required this.providerKey,
    required this.config,
  });

  final String providerKey;
  final Map<String, Object?> config;
}

final class InterestCoveragePlanAlternativeDraftApiDto {
  const InterestCoveragePlanAlternativeDraftApiDto({
    required this.label,
    required this.config,
    required this.rationale,
  });

  final String label;
  final Map<String, Object?> config;
  final List<String> rationale;
}

final class InterestCoveragePlanCadenceSuggestionApiDto {
  const InterestCoveragePlanCadenceSuggestionApiDto({
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
  });

  final num intervalSeconds;
  final num freshnessSeconds;
  final num retryBudget;
}

final class InterestCoveragePlanSkippedProviderApiDto {
  const InterestCoveragePlanSkippedProviderApiDto({
    required this.providerKey,
    required this.reason,
  });

  final String providerKey;
  final String reason;
}
