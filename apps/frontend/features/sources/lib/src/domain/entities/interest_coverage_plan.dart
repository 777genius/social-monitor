import '../value_objects/interest_coverage_plan_draft_status.dart';
import '../value_objects/source_binding_id.dart';
import '../value_objects/source_interest_id.dart';
import '../value_objects/source_provider_key.dart';

final class InterestCoveragePlan {
  const InterestCoveragePlan({
    required this.interestId,
    required this.interestTitle,
    required this.planningQuery,
    required this.normalizedKeywords,
    required this.drafts,
    required this.coverageGaps,
    required this.skippedProviders,
    this.sourcePack,
  });

  final SourceInterestId interestId;
  final String interestTitle;
  final String planningQuery;
  final List<String> normalizedKeywords;
  final InterestCoverageSourcePack? sourcePack;
  final List<InterestCoveragePlanDraft> drafts;
  final List<String> coverageGaps;
  final List<InterestCoveragePlanSkippedProvider> skippedProviders;

  List<InterestCoveragePlanDraft> get applicableDrafts => drafts
      .where((draft) => draft.sourceBindingDraft != null && draft.canApply)
      .toList(growable: false);
}

final class InterestCoverageSourcePack {
  const InterestCoverageSourcePack({
    required this.key,
    required this.displayName,
    required this.description,
    required this.providerStarters,
  });

  final String key;
  final String displayName;
  final String description;
  final List<InterestCoverageSourcePackProviderStarter> providerStarters;
}

final class InterestCoverageSourcePackProviderStarter {
  const InterestCoverageSourcePackProviderStarter({
    required this.providerKey,
    required this.label,
    required this.keywords,
    required this.queries,
    required this.subreddits,
    required this.topics,
    required this.languages,
    required this.rssFeedUrls,
  });

  final SourceProviderKey providerKey;
  final String label;
  final List<String> keywords;
  final List<String> queries;
  final List<String> subreddits;
  final List<String> topics;
  final List<String> languages;
  final List<String> rssFeedUrls;
}

final class InterestCoveragePlanDraft {
  const InterestCoveragePlanDraft({
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

  final SourceProviderKey providerKey;
  final String displayName;
  final InterestCoveragePlanDraftStatus status;
  final num confidenceScore;
  final num priority;
  final List<String> targetContentUnits;
  final List<String> queryModes;
  final List<String> rationale;
  final List<String> warnings;
  final InterestCoveragePlanBindingDraft? sourceBindingDraft;
  final SourceBindingId? existingSourceBindingId;
  final InterestCoveragePlanCadenceSuggestion? cadenceSuggestion;
  final List<InterestCoveragePlanAlternativeDraft> alternativeDrafts;

  bool get canApply =>
      status.canApply && sourceBindingDraft != null && providerKey.isValid;
}

final class InterestCoveragePlanBindingDraft {
  const InterestCoveragePlanBindingDraft({
    required this.providerKey,
    required this.config,
  });

  final SourceProviderKey providerKey;
  final Map<String, Object?> config;
}

final class InterestCoveragePlanAlternativeDraft {
  const InterestCoveragePlanAlternativeDraft({
    required this.label,
    required this.config,
    required this.rationale,
  });

  final String label;
  final Map<String, Object?> config;
  final List<String> rationale;
}

final class InterestCoveragePlanCadenceSuggestion {
  const InterestCoveragePlanCadenceSuggestion({
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
  });

  final num intervalSeconds;
  final num freshnessSeconds;
  final num retryBudget;
}

final class InterestCoveragePlanSkippedProvider {
  const InterestCoveragePlanSkippedProvider({
    required this.providerKey,
    required this.reason,
  });

  final SourceProviderKey providerKey;
  final String reason;
}
