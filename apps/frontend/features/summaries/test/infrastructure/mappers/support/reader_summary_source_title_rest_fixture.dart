import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../../anti_corruption/reader_post_promotion_v2_body_fixture.dart';
import 'reader_summary_additional_stories_transport_fixture.dart';

const sourceTitleCardTitle = 'Runtime regression discussion';
const sourceTitleCardBody = 'Users are discussing a runtime regression.';

Map<String, Object?> sourceTitleUnavailableHeadlineJson() => const {
  'status': 'unavailable',
  'reasonCode': 'not_assessed',
};

Map<String, Object?> sourceTitleCapturedSourceJson() => const {
  'title': sourceTitleCardTitle,
  'body': sourceTitleCardBody,
  'captureAvailability': 'available',
  'reviewAvailability': 'body_present',
};

Map<String, Object?> sourceTitleSealJson() => {
  'headline': sourceTitleUnavailableHeadlineJson(),
};

Map<String, Object?> sourceTitleCanonicalAttestationJson() {
  final canonical = v2PromotionCanonicalBody()
    ..['displayHeadline'] = sourceTitleSealJson();
  final payload = jsonEncode(canonical);
  return {
    ...canonical,
    'digest': sha256.convert(utf8.encode(payload)).toString(),
    'canonicalPayload': payload,
    'displayHeadline': sourceTitleSealJson(),
  };
}

Map<String, Object?> sourceTitleTopReadJson() => {
  'title': sourceTitleCardTitle,
  'providerKey': 'hacker-news',
  'providerName': 'Hacker News',
  'primaryActionKind': 'read_source',
  'reason':
      'Selected by editorial policy: reader_promotion_v2_admitted, top_slot_assigned.',
  'whyImportant': <Object?>[],
  'whyNow': 'Selected from 1 admitted provider family in this summary window.',
  'matchedInterestIds': <Object?>[],
  'matchedRules': [
    'reader-card-kind:curated_top_read',
    'reader-story-cluster:cluster:release',
  ],
  'signalScore': 0.7,
  'confidence': {
    'level': 'high',
    'score': 0.8,
    'rationale': 'Synthetic V2 source-title.',
  },
  'confirmedProviderKeys': ['hacker-news'],
  'providerMetrics': <Object?>[],
  'citationIds': ['citation-1'],
  'canonicalUrl': 'https://news.ycombinator.com/item?id=456',
  'publishedAt': '2026-08-18T10:00:00.000Z',
  'displayHeadline': sourceTitleUnavailableHeadlineJson(),
  'capturedSource': sourceTitleCapturedSourceJson(),
  'promotionAttestation': sourceTitleCanonicalAttestationJson(),
};

Map<String, dynamic> sourceTitleReaderBriefJson() {
  final briefJson =
      jsonDecode(jsonEncode(additionalStoriesReaderBriefTransportFixture()))
          as Map<String, dynamic>;
  briefJson['topReads'] = [sourceTitleTopReadJson()];
  briefJson['selectedPosts'] = <Object?>[];
  return jsonDecode(jsonEncode(briefJson)) as Map<String, dynamic>;
}

generated.ReaderSummaryArtifactResponseDto sourceTitleArtifactResponseDto() {
  final now = DateTime.utc(2026, 8, 18, 12);
  return generated.ReaderSummaryArtifactResponseDto(
    readerSummaryId: 'artifact-1',
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    citations: const [
      generated.ReaderSummaryCitationViewDto(
        canonicalUrl: 'https://news.ycombinator.com/item?id=456',
        citationId: 'citation-1',
        feedItemId: 'candidate-top',
        field: generated.ReaderSummaryCitationViewDtoFieldField.title,
        label: '[1]',
        providerKey: 'hacker-news',
        sourceItemId: 'source-top',
      ),
    ],
    confidence: const generated.ReaderSummaryConfidenceDto(
      level: generated.ReaderSummaryConfidenceDtoLevelLevel.medium,
      rationale: 'Enough evidence for a source-title readerSummary.',
      score: 0.7,
    ),
    executiveSummary: 'Source-title cards remain on the published board.',
    freshness: generated.ReaderSummaryFreshnessDto(
      checkedAt: now,
      status: generated.ReaderSummaryFreshnessDtoStatusStatus.fresh,
    ),
    headline: 'Source-title readerSummary',
    generatedAt: now,
    interestHighlights: const [],
    lineage: const generated.ReaderSummaryLineageDto(
      evalDatasetVersion: 'reader_summary.eval.mvp.v1',
      modelVersion: 'deterministic-local',
      promptVersion: 'reader_summary.prompt.v1',
      providerVersion: 'deterministic-local',
      rulesVersion: 'reader_summary.rules.policy.v1',
      schemaVersion: 'reader_summary.artifact.v1',
    ),
    period: generated.ReaderSummaryPeriodDto(
      cadence: generated.ReaderSummaryPeriodDtoCadenceCadence.daily,
      startedAt: additionalStoriesTransportPeriod.startedAt,
      endedAt: additionalStoriesTransportPeriod.endedAt,
      timezone: 'UTC',
      periodKey:
          'daily:2026-08-18T00:00:00.000Z:2026-08-19T00:00:00.000Z:UTC',
    ),
    qualityFlags: const [],
    readerBrief: generated.ReaderSummaryReaderBriefDto.fromJson(
      sourceTitleReaderBriefJson(),
    ),
    repeatedSignals: const [],
    risksAndUnknowns: const [],
    schemaVersion: 'reader_summary.artifact.v1',
    scope: const generated.ReaderSummaryScopeDto(
      type: generated.ReaderSummaryScopeDtoTypeType.workspace,
    ),
    sourceWindow: generated.ReaderSummarySourceWindowDto(
      startedAt: DateTime.utc(2026, 8, 18),
      endedAt: DateTime.utc(2026, 8, 19),
      ingestionCutoff: DateTime.utc(2026, 8, 18, 23),
      selectedFeedItemIds: const ['candidate-top'],
      storyClusterIds: const ['cluster:release'],
      windowId: 'window-1',
    ),
    storyClusters: [
      generated.ReaderSummaryStoryClusterDto(
        duplicateFeedItemIds: const [],
        id: 'cluster:release',
        interestIds: const [],
        observedAtRange: generated.ReaderSummaryObservedAtRangeDto(
          startedAt: DateTime.utc(2026, 8, 18, 10),
          endedAt: DateTime.utc(2026, 8, 18, 11),
        ),
        providerKeys: const ['hacker-news'],
        representativeFeedItemId: 'candidate-top',
        score: 0.8,
        storyKey: 'story:release',
        whyImportant: const ['Synthetic V2 source-title.'],
      ),
    ],
    topStories: const [],
    usage: const generated.ReaderSummaryUsageDto(
      estimatedCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    ),
  );
}
