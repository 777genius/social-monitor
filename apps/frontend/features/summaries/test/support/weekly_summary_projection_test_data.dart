import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';
import 'package:social_monitor_summaries/src/domain/entities/weekly_summary_artifact.dart';
import 'package:social_monitor_summaries/src/domain/entities/weekly_summary_citation.dart';
import 'package:social_monitor_summaries/src/domain/entities/weekly_summary_section.dart';
import 'package:social_monitor_summaries/src/domain/entities/weekly_summary_story.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/weekly_summary_evidence_limitation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/weekly_summary_week.dart';

const weeklySummaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-weekly-test',
  workspaceId: 'workspace-weekly-test',
);

final weeklySummaryTestWeek = WeeklySummaryWeek.fromUtcMonday(
  DateTime.utc(2026, 7, 20),
);

WeeklySummaryArtifact weeklySummaryTestArtifact({WeeklySummaryWeek? week}) {
  final resolvedWeek = week ?? weeklySummaryTestWeek;
  const citationId = 'citation-1';
  final citation = _requireValue(
    WeeklySummaryCitation.create(
      citationId: citationId,
      requestedUtcDate: resolvedWeek.startedOnIso,
      publicationId: 'publication-1',
      providerKey: 'provider-test',
      feedItemId: 'feed-item-1',
      sourceItemId: 'source-item-1',
      sourceBindingId: 'binding-1',
      providerItemId: 'provider-item-1',
      canonicalUrl: 'https://example.test/evidence-1?fixture=1#evidence',
      sourceContentHash: 'source-content-sha-1',
    ),
  );
  final story = _requireValue(
    WeeklySummaryStory.create(
      storyId: 'story-1',
      headline: 'Synthetic story',
      summary: 'Synthetic story summary',
      status: WeeklySummaryStoryStatus.developing,
      observedFrom: resolvedWeek.startedOnIso,
      observedThrough: resolvedWeek.endedOnIso,
      citationIds: const [citationId],
    ),
  );
  final section = _requireValue(
    WeeklySummarySection.create(
      sectionId: 'section-1',
      storyId: story.storyId,
      kind: WeeklySummarySectionKind.development,
      claimType: WeeklySummaryClaimType.evolution,
      heading: 'Synthetic development',
      text: 'Synthetic evidence-backed section.',
      observedFrom: resolvedWeek.startedOnIso,
      observedThrough: resolvedWeek.endedOnIso,
      citationIds: const [citationId],
    ),
  );
  final provenance = _requireValue(
    WeeklySummaryArtifactProvenance.create(
      artifactId: 'artifact-1',
      artifactSha256: 'artifact-sha-1',
      schemaVersion: WeeklySummaryArtifactProvenance.supportedSchemaVersion,
      sealId: 'seal-1',
      sealSha256: 'seal-sha-1',
      publicationProofId: 'publication-proof-1',
      publicationProofSha256: 'publication-proof-sha-1',
      modelInputSealId: 'model-input-seal-1',
      modelInputSealSha256: 'model-input-seal-sha-1',
      editorialQualitySha256: 'editorial-quality-sha-1',
    ),
  );
  return _requireValue(
    WeeklySummaryArtifact.create(
      week: resolvedWeek,
      provenance: provenance,
      headline: 'Weekly synthetic headline',
      headlineCitationIds: const [citationId],
      takeaway: 'Weekly synthetic takeaway',
      takeawayCitationIds: const [citationId],
      synthesis: 'Weekly synthetic synthesis',
      synthesisCitationIds: const [citationId],
      stories: [story],
      sections: [section],
      citations: [citation],
    ),
  );
}

CompleteWeeklySummaryProjection completeWeeklySummaryProjection({
  WorkspaceScope scope = weeklySummaryWorkspaceScope,
  WeeklySummaryWeek? week,
  List<WeeklySummaryEvidenceLimitation> evidenceLimitations = const [],
}) {
  final resolvedWeek = week ?? weeklySummaryTestWeek;
  final projection = _requireValue(
    WeeklySummaryProjection.create(
      status: WeeklySummaryProjectionStatus.complete,
      scope: scope,
      week: resolvedWeek,
      certifiedDailyEvidenceDates: resolvedWeek.utcDates,
      missingDailyEvidenceDates: const [],
      blockingReasons: const [],
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: evidenceLimitations,
      artifact: weeklySummaryTestArtifact(week: resolvedWeek),
    ),
  );
  if (projection is! CompleteWeeklySummaryProjection) {
    throw StateError('Expected a complete weekly summary projection.');
  }
  return projection;
}

PartialWeeklySummaryProjection partialWeeklySummaryProjection({
  WorkspaceScope scope = weeklySummaryWorkspaceScope,
  WeeklySummaryWeek? week,
  bool hasCompleteEvidence = false,
  bool activeWeeklyCertifiedArtifactPresent = false,
  List<WeeklySummaryEvidenceLimitation> evidenceLimitations = const [],
}) {
  final resolvedWeek = week ?? weeklySummaryTestWeek;
  final certified = hasCompleteEvidence
      ? resolvedWeek.utcDates
      : resolvedWeek.utcDates.take(6).toList(growable: false);
  final missing = hasCompleteEvidence
      ? const <String>[]
      : <String>[resolvedWeek.utcDates.last];
  final reasons = <WeeklySummaryBlockingReason>[
    if (!hasCompleteEvidence)
      WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
    if (!activeWeeklyCertifiedArtifactPresent)
      WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing,
  ];
  final projection = _requireValue(
    WeeklySummaryProjection.create(
      status: WeeklySummaryProjectionStatus.partial,
      scope: scope,
      week: resolvedWeek,
      certifiedDailyEvidenceDates: certified,
      missingDailyEvidenceDates: missing,
      blockingReasons: reasons,
      activeWeeklyCertifiedArtifactPresent:
          activeWeeklyCertifiedArtifactPresent,
      evidenceLimitations: evidenceLimitations,
      artifact: null,
    ),
  );
  if (projection is! PartialWeeklySummaryProjection) {
    throw StateError('Expected a partial weekly summary projection.');
  }
  return projection;
}

UnavailableWeeklySummaryProjection unavailableWeeklySummaryProjection({
  WorkspaceScope scope = weeklySummaryWorkspaceScope,
  WeeklySummaryWeek? week,
}) {
  final resolvedWeek = week ?? weeklySummaryTestWeek;
  final projection = _requireValue(
    WeeklySummaryProjection.create(
      status: WeeklySummaryProjectionStatus.unavailable,
      scope: scope,
      week: resolvedWeek,
      certifiedDailyEvidenceDates: const [],
      missingDailyEvidenceDates: resolvedWeek.utcDates,
      blockingReasons: const [
        WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
        WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing,
      ],
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: const [],
      artifact: null,
    ),
  );
  if (projection is! UnavailableWeeklySummaryProjection) {
    throw StateError('Expected an unavailable weekly summary projection.');
  }
  return projection;
}

WeeklySummaryEvidenceLimitation weeklySummaryHistoricalLimitation({
  String? requestedUtcDate,
}) => _requireValue(
  WeeklySummaryEvidenceLimitation.create(
    requestedUtcDate:
        requestedUtcDate ?? weeklySummaryTestWeek.utcDates.first,
    providerKey: WeeklySummaryEvidenceLimitation.githubTrendingProvider,
    evidenceState: WeeklySummaryEvidenceLimitation.historicalUnavailableState,
  ),
);

T _requireValue<T extends Object>(Result<T> result) => result.fold(
  onSuccess: (value) => value,
  onFailure: (failure) => throw StateError(failure.code ?? failure.message),
);
