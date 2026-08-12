import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/weekly_summary_projection_mapper.dart';

import '../../support/weekly_summary_projection_test_data.dart';

void main() {
  const mapper = WeeklySummaryProjectionMapper();

  test('maps a complete projection with safe provenance and citation URLs', () {
    final payload = _completePayload();
    _citation(payload)['canonicalUrl'] =
        'https://example.test/evidence-1?fixture=private#section';

    final projection = _projectionValue(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
    );

    expect(projection, isA<CompleteWeeklySummaryProjection>());
    final artifact = (projection as CompleteWeeklySummaryProjection).artifact;
    expect(artifact.provenance.artifactId, 'artifact-1');
    expect(artifact.sections.single.citationIds, ['citation-1']);
    expect(artifact.citations.single.canonicalUri.query, isEmpty);
    expect(artifact.citations.single.canonicalUri.fragment, isEmpty);
    expect(artifact.citations.single.safeDisplayLocation, 'example.test/evidence-1');
  });

  test('maps an artifact-missing partial projection with all daily evidence', () {
    final payload = _completePayload();
    payload['status'] = 'partial';
    payload['blockingReasons'] = [
      'active_weekly_certified_artifact_missing',
    ];
    payload['artifact'] = null;

    final projection = _projectionValue(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
    );

    expect(projection, isA<PartialWeeklySummaryProjection>());
  });

  test('validates but withholds an attached artifact for incomplete evidence', () {
    final payload = _completePayload();
    payload['status'] = 'partial';
    payload['certifiedDailyEvidenceDates'] = weeklySummaryTestWeek.utcDates
        .take(6)
        .toList();
    payload['missingDailyEvidenceDates'] = [weeklySummaryTestWeek.utcDates.last];
    payload['blockingReasons'] = ['certified_daily_evidence_incomplete'];

    final projection = _projectionValue(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
    );

    expect(projection, isA<PartialWeeklySummaryProjection>());
    expect(projection, isNot(isA<CompleteWeeklySummaryProjection>()));
  });

  test('maps an unavailable projection without an artifact', () {
    final payload = _completePayload();
    payload['status'] = 'unavailable';
    payload['certifiedDailyEvidenceDates'] = <String>[];
    payload['missingDailyEvidenceDates'] = weeklySummaryTestWeek.utcDates;
    payload['blockingReasons'] = [
      'certified_daily_evidence_incomplete',
      'active_weekly_certified_artifact_missing',
    ];
    payload['artifact'] = null;

    final projection = _projectionValue(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
    );

    expect(projection, isA<UnavailableWeeklySummaryProjection>());
  });

  test('fails closed when certification or blocking facts do not match status', () {
    final incompleteComplete = _completePayload();
    incompleteComplete['certifiedDailyEvidenceDates'] = weeklySummaryTestWeek.utcDates
        .take(6)
        .toList();
    incompleteComplete['missingDailyEvidenceDates'] = [
      weeklySummaryTestWeek.utcDates.last,
    ];
    final completeWithBlockingReason = _completePayload();
    completeWithBlockingReason['blockingReasons'] = [
      'active_weekly_certified_artifact_missing',
    ];

    for (final payload in [incompleteComplete, completeWithBlockingReason]) {
      _expectFailureCode(
        mapper.toDomain(
          ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
          scope: weeklySummaryWorkspaceScope,
          requestedWeek: weeklySummaryTestWeek,
        ),
        'summaries.weekly_projection_invalid',
      );
    }
  });

  test('fails closed for unknown projection or artifact schemas and status', () {
    final unsupportedProjectionSchema = _completePayload()
      ..['schemaVersion'] = 'reader_summary.weekly_projection.v2';
    final unknownStatus = _completePayload()..['status'] = 'future_status';
    final unsupportedArtifactSchema = _completePayload();
    _artifact(unsupportedArtifactSchema)['schemaVersion'] =
        'reader_summary.weekly_model_output.v2';

    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(
          unsupportedProjectionSchema,
        ),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_schema_unsupported',
    );
    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(unknownStatus),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_status_unsupported',
    );
    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(
          unsupportedArtifactSchema,
        ),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_artifact_schema_unsupported',
    );
  });

  test('fails closed for returned scope or week mismatches', () {
    final wrongScope = _completePayload()
      ..['tenantId'] = 'tenant-other';
    final wrongWeek = _completePayload()..['weekEndedOn'] = '2026-08-02';

    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(wrongScope),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_scope_mismatch',
    );
    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(wrongWeek),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_window_mismatch',
    );
  });

  test('fails closed for malformed artifact cardinality and citations', () {
    final emptyStories = _completePayload();
    _artifact(emptyStories)['stories'] = <Map<String, Object?>>[];
    final unknownCitation = _completePayload();
    _artifact(unknownCitation)['headlineCitationIds'] = ['citation-missing'];
    final uncitedCitation = _completePayload();
    final citations =
        _artifact(uncitedCitation)['citations']! as List<Map<String, Object?>>;
    citations.add(
      Map<String, Object?>.from(citations.single)..['citationId'] = 'citation-2',
    );
    final malformedWithheldArtifact = _completePayload();
    malformedWithheldArtifact['status'] = 'partial';
    malformedWithheldArtifact['certifiedDailyEvidenceDates'] =
        weeklySummaryTestWeek.utcDates.take(6).toList();
    malformedWithheldArtifact['missingDailyEvidenceDates'] = [
      weeklySummaryTestWeek.utcDates.last,
    ];
    malformedWithheldArtifact['blockingReasons'] = [
      'certified_daily_evidence_incomplete',
    ];
    _artifact(malformedWithheldArtifact)['stories'] = <Map<String, Object?>>[];

    for (final payload in [
      emptyStories,
      unknownCitation,
      uncitedCitation,
      malformedWithheldArtifact,
    ]) {
      _expectFailureCode(
        mapper.toDomain(
          ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
          scope: weeklySummaryWorkspaceScope,
          requestedWeek: weeklySummaryTestWeek,
        ),
        'summaries.weekly_artifact_invalid',
      );
    }
  });

  test('rejects citation userinfo before it reaches presentation', () {
    final payload = _completePayload();
    _citation(payload)['canonicalUrl'] =
        'https://reader:fixture@example.test/evidence-1';

    _expectFailureCode(
      mapper.toDomain(
        ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        scope: weeklySummaryWorkspaceScope,
        requestedWeek: weeklySummaryTestWeek,
      ),
      'summaries.weekly_citation_invalid',
    );
  });
}

WeeklySummaryProjection _projectionValue(
  Result<WeeklySummaryProjection> result,
) =>
    switch (result) {
      ResultSuccess<WeeklySummaryProjection>(:final value) => value,
      ResultFailure<WeeklySummaryProjection>(:final failure) => throw StateError(
        failure.code ?? failure.message,
      ),
    };

void _expectFailureCode(
  Result<WeeklySummaryProjection> result,
  String expectedCode,
) {
  expect(result, isA<ResultFailure<WeeklySummaryProjection>>());
  expect(
    (result as ResultFailure<WeeklySummaryProjection>).failure.code,
    expectedCode,
  );
}

Map<String, Object?> _artifact(Map<String, Object?> payload) =>
    payload['artifact']! as Map<String, Object?>;

Map<String, Object?> _citation(Map<String, Object?> payload) =>
    (_artifact(payload)['citations']! as List<Map<String, Object?>>).single;

Map<String, Object?> _completePayload() => <String, Object?>{
      'schemaVersion': 'reader_summary.weekly_projection.v1',
      'tenantId': weeklySummaryWorkspaceScope.tenantId,
      'workspaceId': weeklySummaryWorkspaceScope.workspaceId,
      'weekStartedOn': '2026-07-20',
      'weekEndedOn': '2026-07-26',
      'status': 'complete',
      'certifiedDailyEvidenceDates': weeklySummaryTestWeek.utcDates,
      'missingDailyEvidenceDates': <String>[],
      'blockingReasons': <String>[],
      'artifact': <String, Object?>{
        'artifactId': 'artifact-1',
        'schemaVersion': 'reader_summary.weekly_model_output.v1',
        'sealId': 'seal-1',
        'sealSha256': 'seal-sha-1',
        'publicationProofId': 'publication-proof-1',
        'publicationProofSha256': 'publication-proof-sha-1',
        'modelInputSealId': 'model-input-seal-1',
        'modelInputSealSha256': 'model-input-seal-sha-1',
        'artifactSha256': 'artifact-sha-1',
        'editorialQualitySha256': 'editorial-quality-sha-1',
        'headline': 'Weekly synthetic headline',
        'headlineCitationIds': <String>['citation-1'],
        'takeaway': 'Weekly synthetic takeaway',
        'takeawayCitationIds': <String>['citation-1'],
        'synthesis': 'Weekly synthetic synthesis',
        'synthesisCitationIds': <String>['citation-1'],
        'stories': <Map<String, Object?>>[
          <String, Object?>{
            'storyId': 'story-1',
            'headline': 'Synthetic story',
            'summary': 'Synthetic story summary',
            'status': 'developing',
            'observedFrom': '2026-07-20',
            'observedThrough': '2026-07-26',
            'citationIds': <String>['citation-1'],
          },
        ],
        'sections': <Map<String, Object?>>[
          <String, Object?>{
            'sectionId': 'section-1',
            'storyId': 'story-1',
            'kind': 'development',
            'claimType': 'evolution',
            'heading': 'Synthetic development',
            'text': 'Synthetic evidence-backed section.',
            'observedFrom': '2026-07-20',
            'observedThrough': '2026-07-26',
            'citationIds': <String>['citation-1'],
          },
        ],
        'citations': <Map<String, Object?>>[
          <String, Object?>{
            'citationId': 'citation-1',
            'requestedUtcDate': '2026-07-20',
            'publicationId': 'publication-1',
            'providerKey': 'provider-test',
            'feedItemId': 'feed-item-1',
            'sourceItemId': 'source-item-1',
            'sourceBindingId': 'binding-1',
            'providerItemId': 'provider-item-1',
            'canonicalUrl': 'https://example.test/evidence-1',
            'sourceContentHash': 'source-content-sha-1',
          },
        ],
      },
    };
