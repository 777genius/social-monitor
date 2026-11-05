import 'package:dio/dio.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  group('reader summaries weekly projection client', () {
    test(
      'decodes a complete weekly model output with sealed provenance',
      () async {
        final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test'));
        RequestOptions? capturedRequest;
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              capturedRequest = options;
              handler.resolve(
                Response<Map<String, Object?>>(
                  requestOptions: options,
                  statusCode: 200,
                  data: _completeProjectionPayload(),
                ),
              );
            },
          ),
        );

        final response = await SocialMonitorRestClient(dio).readerSummaries
            .readerSummaryWeeklyProjectionControllerGet(
              weekStartedOn: DateTime.utc(2026, 7, 20),
              xWorkspaceId: 'workspace-1',
              xTenantId: 'tenant-1',
              xWorkspaceRole: 'viewer',
            );

        expect(
          response.schemaVersion.toJson(),
          'reader_summary.weekly_projection.v1',
        );
        expect(response.status.toJson(), 'complete');
        expect(response.tenantId, 'tenant-1');
        expect(response.workspaceId, 'workspace-1');
        expect(response.weekStartedOn, DateTime(2026, 7, 20));
        expect(response.weekEndedOn, DateTime(2026, 7, 26));
        expect(response.certifiedDailyEvidenceDates, _weekDateValues);
        expect(response.missingDailyEvidenceDates, isEmpty);
        expect(response.blockingReasons, isEmpty);
        expect(response.activeWeeklyCertifiedArtifactPresent, isTrue);
        expect(response.evidenceLimitations, isEmpty);

        final artifact = response.artifact;
        expect(artifact, isNotNull);
        if (artifact == null) {
          fail('Complete weekly projection must include an artifact.');
        }
        expect(artifact.artifactId, 'weekly-artifact-1');
        expect(artifact.schemaVersion, 'reader_summary.weekly_model_output.v1');
        expect(artifact.sealId, 'weekly-seal-1');
        expect(artifact.sealSha256, 'seal-sha-1');
        expect(artifact.publicationProofId, 'publication-proof-1');
        expect(artifact.publicationProofSha256, 'publication-proof-sha-1');
        expect(artifact.modelInputSealId, 'model-input-seal-1');
        expect(artifact.modelInputSealSha256, 'model-input-seal-sha-1');
        expect(artifact.artifactSha256, 'artifact-sha-1');
        expect(artifact.editorialQualitySha256, 'editorial-quality-sha-1');
        expect(artifact.headline, 'Weekly synthetic headline');
        expect(artifact.takeaway, 'Weekly synthetic takeaway');
        expect(artifact.synthesis, 'Weekly synthetic synthesis');

        final story = artifact.stories.first;
        expect(story.storyId, 'story-1');
        expect(story.headline, 'Synthetic story');
        expect(story.summary, 'Synthetic summary');
        expect(story.status.toJson(), 'developing');
        expect(story.observedFrom, DateTime(2026, 7, 20));
        expect(story.observedThrough, DateTime(2026, 7, 26));
        expect(story.citationIds, ['citation-1']);
        expect(
          artifact.stories.map((value) => value.status.toJson()).toList(),
          ['developing', 'resolved', 'watch', 'new'],
        );

        final section = artifact.sections.first;
        expect(section.sectionId, 'section-1');
        expect(section.storyId, story.storyId);
        expect(section.kind.toJson(), 'development');
        expect(section.claimType.toJson(), 'evolution');
        expect(section.heading, 'Synthetic development');
        expect(section.text, 'Synthetic evidence-backed text');
        expect(section.observedFrom, DateTime(2026, 7, 20));
        expect(section.observedThrough, DateTime(2026, 7, 26));
        expect(section.citationIds, ['citation-1']);
        expect(artifact.sections.map((value) => value.kind.toJson()).toList(), [
          'development',
          'lead',
          'why_it_matters',
          'watch',
        ]);
        expect(
          artifact.sections.map((value) => value.claimType.toJson()).toList(),
          ['evolution', 'snapshot', 'resolution', 'snapshot'],
        );

        final citation = artifact.citations.single;
        expect(citation.citationId, 'citation-1');
        expect(citation.requestedUtcDate, DateTime(2026, 7, 20));
        expect(citation.publicationId, 'publication-1');
        expect(citation.providerKey, 'provider-test');
        expect(citation.feedItemId, 'feed-item-1');
        expect(citation.sourceItemId, 'source-item-1');
        expect(citation.sourceBindingId, 'binding-1');
        expect(citation.providerItemId, 'provider-item-1');
        expect(citation.canonicalUrl, 'https://example.test/evidence-1');
        expect(citation.sourceContentHash, 'source-content-sha-1');
        expect(artifact.headlineCitationIds, [citation.citationId]);
        expect(artifact.takeawayCitationIds, [citation.citationId]);
        expect(artifact.synthesisCitationIds, [citation.citationId]);

        final request = capturedRequest;
        expect(request, isNotNull);
        expect(request!.method, 'GET');
        expect(request.path, '/reader-summaries/weekly');
        expect(request.queryParameters, {
          'weekStartedOn': '2026-07-20T00:00:00.000Z',
        });
        expect(request.headers['x-workspace-id'], 'workspace-1');
        expect(request.headers['x-tenant-id'], 'tenant-1');
        expect(request.headers['x-workspace-role'], 'viewer');
      },
    );

    test(
      'preserves partial and unavailable evidence states without artifacts',
      () {
        final partial = ReaderSummaryWeeklyProjectionResponseDto.fromJson(
          _partialProjectionPayload(),
        );
        final unavailable = ReaderSummaryWeeklyProjectionResponseDto.fromJson(
          _unavailableProjectionPayload(),
        );

        expect(partial.status.toJson(), 'partial');
        expect(partial.artifact, isNull);
        expect(partial.activeWeeklyCertifiedArtifactPresent, isTrue);
        expect(
          partial.evidenceLimitations.single.requestedUtcDate,
          DateTime(2026, 7, 20),
        );
        expect(
          partial.evidenceLimitations.single.evidenceState.toJson(),
          'historical_unavailable',
        );
        expect(partial.missingDailyEvidenceDates, [DateTime(2026, 7, 26)]);
        expect(
          partial.blockingReasons.single.toJson(),
          'certified_daily_evidence_incomplete',
        );

        expect(unavailable.status.toJson(), 'unavailable');
        expect(unavailable.artifact, isNull);
        expect(unavailable.activeWeeklyCertifiedArtifactPresent, isFalse);
        expect(unavailable.certifiedDailyEvidenceDates, isEmpty);
        expect(
          unavailable.blockingReasons.map((reason) => reason.toJson()),
          containsAll([
            'certified_daily_evidence_incomplete',
            'active_weekly_certified_artifact_missing',
          ]),
        );
      },
    );

    test('fails closed when complete provenance omits required citations', () {
      final payload = _completeProjectionPayload();
      final artifact = payload['artifact']! as Map<String, Object?>;
      artifact.remove('citations');

      expect(
        () => ReaderSummaryWeeklyProjectionResponseDto.fromJson(payload),
        throwsA(isA<TypeError>()),
      );
    });
  });
}

const _weekDates = <String>[
  '2026-07-20',
  '2026-07-21',
  '2026-07-22',
  '2026-07-23',
  '2026-07-24',
  '2026-07-25',
  '2026-07-26',
];

final _weekDateValues = _weekDates.map(DateTime.parse).toList(growable: false);

Map<String, Object?> _completeProjectionPayload() => <String, Object?>{
  'schemaVersion': 'reader_summary.weekly_projection.v1',
  'tenantId': 'tenant-1',
  'workspaceId': 'workspace-1',
  'weekStartedOn': '2026-07-20',
  'weekEndedOn': '2026-07-26',
  'status': 'complete',
  'certifiedDailyEvidenceDates': _weekDates,
  'missingDailyEvidenceDates': <String>[],
  'blockingReasons': <String>[],
  'activeWeeklyCertifiedArtifactPresent': true,
  'evidenceLimitations': <Map<String, Object?>>[],
  'artifact': <String, Object?>{
    'artifactId': 'weekly-artifact-1',
    'schemaVersion': 'reader_summary.weekly_model_output.v1',
    'sealId': 'weekly-seal-1',
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
        'summary': 'Synthetic summary',
        'status': 'developing',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'storyId': 'story-2',
        'headline': 'Resolved synthetic story',
        'summary': 'Resolved synthetic summary',
        'status': 'resolved',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'storyId': 'story-3',
        'headline': 'Watch synthetic story',
        'summary': 'Watch synthetic summary',
        'status': 'watch',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'storyId': 'story-4',
        'headline': 'New synthetic story',
        'summary': 'New synthetic summary',
        'status': 'new',
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
        'text': 'Synthetic evidence-backed text',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'sectionId': 'section-2',
        'storyId': 'story-2',
        'kind': 'lead',
        'claimType': 'snapshot',
        'heading': 'Synthetic lead',
        'text': 'Synthetic snapshot text',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'sectionId': 'section-3',
        'storyId': 'story-3',
        'kind': 'why_it_matters',
        'claimType': 'resolution',
        'heading': 'Synthetic impact',
        'text': 'Synthetic resolution text',
        'observedFrom': '2026-07-20',
        'observedThrough': '2026-07-26',
        'citationIds': <String>['citation-1'],
      },
      <String, Object?>{
        'sectionId': 'section-4',
        'storyId': 'story-4',
        'kind': 'watch',
        'claimType': 'snapshot',
        'heading': 'Synthetic watch',
        'text': 'Synthetic watch text',
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

Map<String, Object?> _partialProjectionPayload() => <String, Object?>{
  'schemaVersion': 'reader_summary.weekly_projection.v1',
  'tenantId': 'tenant-1',
  'workspaceId': 'workspace-1',
  'weekStartedOn': '2026-07-20',
  'weekEndedOn': '2026-07-26',
  'status': 'partial',
  'certifiedDailyEvidenceDates': _weekDates.take(6).toList(),
  'missingDailyEvidenceDates': <String>['2026-07-26'],
  'blockingReasons': <String>['certified_daily_evidence_incomplete'],
  'activeWeeklyCertifiedArtifactPresent': true,
  'evidenceLimitations': <Map<String, Object?>>[
    <String, Object?>{
      'requestedUtcDate': '2026-07-20',
      'providerKey': 'github-trending-page',
      'evidenceState': 'historical_unavailable',
    },
  ],
  'artifact': null,
};

Map<String, Object?> _unavailableProjectionPayload() => <String, Object?>{
  'schemaVersion': 'reader_summary.weekly_projection.v1',
  'tenantId': 'tenant-1',
  'workspaceId': 'workspace-1',
  'weekStartedOn': '2026-07-20',
  'weekEndedOn': '2026-07-26',
  'status': 'unavailable',
  'certifiedDailyEvidenceDates': <String>[],
  'missingDailyEvidenceDates': _weekDates,
  'blockingReasons': <String>[
    'certified_daily_evidence_incomplete',
    'active_weekly_certified_artifact_missing',
  ],
  'activeWeeklyCertifiedArtifactPresent': false,
  'evidenceLimitations': <Map<String, Object?>>[],
  'artifact': null,
};
