import '../../domain/entities/interest_coverage_plan.dart';
import '../../domain/value_objects/interest_coverage_plan_draft_status.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_interest_id.dart';
import '../../domain/value_objects/source_provider_key.dart';
import '../api/interest_coverage_plan_api_dto.dart';

final class InterestCoveragePlanMapper {
  const InterestCoveragePlanMapper();

  InterestCoveragePlan plan(InterestCoveragePlanApiDto dto) {
    return InterestCoveragePlan(
      interestId: SourceInterestId(dto.interestId),
      interestTitle: dto.interestTitle,
      planningQuery: dto.planningQuery,
      normalizedKeywords: dto.normalizedKeywords,
      drafts: dto.drafts.map(_draft).toList(growable: false),
      coverageGaps: dto.coverageGaps,
      skippedProviders: dto.skippedProviders
          .map(
            (skipped) => InterestCoveragePlanSkippedProvider(
              providerKey: SourceProviderKey(skipped.providerKey),
              reason: skipped.reason,
            ),
          )
          .toList(growable: false),
    );
  }

  InterestCoveragePlanDraft _draft(InterestCoveragePlanDraftApiDto dto) {
    return InterestCoveragePlanDraft(
      providerKey: SourceProviderKey(dto.providerKey),
      displayName: dto.displayName,
      status: _status(dto.status),
      confidenceScore: dto.confidenceScore,
      priority: dto.priority,
      targetContentUnits: dto.targetContentUnits,
      queryModes: dto.queryModes,
      rationale: dto.rationale,
      warnings: dto.warnings,
      sourceBindingDraft: dto.sourceBindingDraft == null
          ? null
          : InterestCoveragePlanBindingDraft(
              providerKey: SourceProviderKey(
                dto.sourceBindingDraft!.providerKey,
              ),
              config: dto.sourceBindingDraft!.config,
            ),
      existingSourceBindingId: dto.existingSourceBindingId == null
          ? null
          : SourceBindingId(dto.existingSourceBindingId!),
      cadenceSuggestion: dto.cadenceSuggestion == null
          ? null
          : InterestCoveragePlanCadenceSuggestion(
              intervalSeconds: dto.cadenceSuggestion!.intervalSeconds,
              freshnessSeconds: dto.cadenceSuggestion!.freshnessSeconds,
              retryBudget: dto.cadenceSuggestion!.retryBudget,
            ),
      alternativeDrafts: dto.alternativeDrafts
          .map(
            (alternative) => InterestCoveragePlanAlternativeDraft(
              label: alternative.label,
              config: alternative.config,
              rationale: alternative.rationale,
            ),
          )
          .toList(growable: false),
    );
  }

  InterestCoveragePlanDraftStatus _status(String value) {
    return switch (value) {
      'ready' => InterestCoveragePlanDraftStatus.ready,
      'needs_input' => InterestCoveragePlanDraftStatus.needsInput,
      'already_bound' => InterestCoveragePlanDraftStatus.alreadyBound,
      'unsupported' => InterestCoveragePlanDraftStatus.unsupported,
      _ => InterestCoveragePlanDraftStatus.unknown,
    };
  }
}
