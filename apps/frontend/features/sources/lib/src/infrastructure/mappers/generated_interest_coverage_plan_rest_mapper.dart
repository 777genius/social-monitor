import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/interest_coverage_plan_api_dto.dart';

final class GeneratedInterestCoveragePlanRestMapper {
  const GeneratedInterestCoveragePlanRestMapper();

  generated.PlanInterestCoverageRequestDto planRequest(
    PlanInterestCoverageApiRequestDto request,
  ) {
    return generated.PlanInterestCoverageRequestDto(
      description: _blankToNull(request.description),
      keywords: _nonEmptyListOrNull(request.keywords),
      subreddits: _nonEmptyListOrNull(request.subreddits),
      rssFeedUrls: _nonEmptyListOrNull(request.rssFeedUrls),
      includeProviders: _nonEmptyListOrNull(request.includeProviders),
      excludeProviders: _nonEmptyListOrNull(request.excludeProviders),
    );
  }

  InterestCoveragePlanApiDto plan(
    generated.PlanInterestCoverageResponseDto dto,
  ) {
    return InterestCoveragePlanApiDto(
      interestId: dto.interest.id,
      interestTitle: dto.interest.name,
      planningQuery: dto.planningQuery,
      normalizedKeywords: dto.normalizedKeywords,
      drafts: dto.drafts.map(_draft).toList(growable: false),
      coverageGaps: dto.coverageGaps,
      skippedProviders: dto.skippedProviders
          .map(
            (skipped) => InterestCoveragePlanSkippedProviderApiDto(
              providerKey: skipped.providerKey,
              reason: skipped.reason,
            ),
          )
          .toList(growable: false),
    );
  }

  InterestCoveragePlanDraftApiDto _draft(
    generated.InterestCoveragePlanDraftDto dto,
  ) {
    return InterestCoveragePlanDraftApiDto(
      providerKey: dto.providerKey,
      displayName: dto.displayName,
      status: dto.status.toJson(),
      confidenceScore: dto.confidenceScore,
      priority: dto.priority,
      targetContentUnits: dto.targetContentUnits,
      queryModes: dto.queryModes,
      rationale: dto.rationale,
      warnings: dto.warnings,
      sourceBindingDraft: dto.sourceBindingDraft == null
          ? null
          : InterestCoveragePlanBindingDraftApiDto(
              providerKey: dto.sourceBindingDraft!.providerKey,
              config: _objectMap(dto.sourceBindingDraft!.config),
            ),
      existingSourceBindingId: dto.existingSourceBindingId,
      cadenceSuggestion: dto.cadenceSuggestion == null
          ? null
          : InterestCoveragePlanCadenceSuggestionApiDto(
              intervalSeconds: dto.cadenceSuggestion!.intervalSeconds,
              freshnessSeconds: dto.cadenceSuggestion!.freshnessSeconds,
              retryBudget: dto.cadenceSuggestion!.retryBudget,
            ),
      alternativeDrafts: dto.alternativeDrafts
          .map(
            (alternative) => InterestCoveragePlanAlternativeDraftApiDto(
              label: alternative.label,
              config: _objectMap(alternative.config),
              rationale: alternative.rationale,
            ),
          )
          .toList(growable: false),
    );
  }

  List<String>? _nonEmptyListOrNull(List<String> values) {
    final normalized = values
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
    return normalized.isEmpty ? null : normalized;
  }

  String? _blankToNull(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  Map<String, Object?> _objectMap(Object? value) {
    if (value is! Map) {
      return const {};
    }
    return Map<String, Object?>.fromEntries(
      value.entries.where((entry) => entry.key is String).map((entry) {
        return MapEntry(entry.key as String, _jsonValue(entry.value));
      }),
    );
  }

  Object? _jsonValue(Object? value) {
    if (value == null || value is String || value is num || value is bool) {
      return value;
    }
    if (value is List) {
      return value.map(_jsonValue).toList(growable: false);
    }
    if (value is Map) {
      return _objectMap(value);
    }
    return '$value';
  }
}
