import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../../integration_test/infrastructure/mappers/support/additional_stories_e2e_rest_boundary.dart';

void main() {
  for (final lane in _PromotionLane.values) {
    for (final exactWindow in const [Duration(hours: 24), Duration(hours: 48)]) {
      test('${lane.name} maps exact ${exactWindow.inHours}h GitHub window', () {
        final summary = _mapFixture(lane: lane, window: exactWindow);
        final projection = readerSummaryTopPostsProjection(summary);

        expect(projection.curatedPosts, hasLength(1));
        expect(projection.additionalNotableStories, hasLength(2));
        expect(
          summary.content.promotionBoardAvailability,
          ReaderSummaryPromotionBoardAvailability.available,
        );
      });
    }
  }

  final exactCases = <({
    String name,
    String publishedAt,
    String observedAt,
    String? ingestionCutoff,
    bool accepted,
  })>[
    (name: 'start -1us',
      publishedAt: '2026-06-22T23:59:59.999999Z',
      observedAt: '2026-06-23T12:00:00.000000Z',
      ingestionCutoff: null, accepted: false),
    (name: 'start boundary',
      publishedAt: '2026-06-23T00:00:00.000000Z',
      observedAt: '2026-06-23T12:00:00.000000Z',
      ingestionCutoff: null, accepted: true),
    (name: 'end -1us',
      publishedAt: '2026-06-23T23:59:59.999999Z',
      observedAt: '2026-06-24T00:00:00.000000Z',
      ingestionCutoff: null, accepted: true),
    (name: 'end boundary',
      publishedAt: '2026-06-24T00:00:00.000000Z',
      observedAt: '2026-06-24T00:00:00.000000Z',
      ingestionCutoff: null, accepted: false),
    (name: 'cutoff -1us',
      publishedAt: '2026-06-23T10:00:00.000000Z',
      observedAt: '2026-06-23T11:59:59.999999Z',
      ingestionCutoff: '2026-06-23T12:00:00.000000Z', accepted: true),
    (name: 'cutoff boundary',
      publishedAt: '2026-06-23T10:00:00.000000Z',
      observedAt: '2026-06-23T12:00:00.000000Z',
      ingestionCutoff: '2026-06-23T12:00:00.000000Z', accepted: true),
    (name: 'cutoff +1us',
      publishedAt: '2026-06-23T10:00:00.000000Z',
      observedAt: '2026-06-23T12:00:00.000001Z',
      ingestionCutoff: '2026-06-23T12:00:00.000000Z', accepted: false),
  ];
  for (final lane in _PromotionLane.values) {
    for (final exactCase in exactCases) {
      test('${lane.name} REST attestation enforces ${exactCase.name}', () {
        final summary = _mapFixture(
          lane: lane,
          window: const Duration(hours: 24),
          exactPublishedAt: exactCase.publishedAt,
          exactObservedAt: exactCase.observedAt,
          exactIngestionCutoff: exactCase.ingestionCutoff,
        );
        final projection = readerSummaryTopPostsProjection(summary);
        expect(
          summary.content.promotionBoardAvailability,
          exactCase.accepted
              ? ReaderSummaryPromotionBoardAvailability.available
              : ReaderSummaryPromotionBoardAvailability.unavailable,
        );
        if (!exactCase.accepted) {
          expect(projection.curatedPosts, isEmpty);
          expect(projection.additionalNotableStories, isEmpty);
        }
      });
    }
  }

  for (final lane in _PromotionLane.values) {
    for (final deviation in const [-1, 1]) {
      test(
        '${lane.name} GitHub window deviating by ${deviation}us suppresses both lanes',
        () {
          final summary = _mapFixture(
            lane: lane,
            window: Duration(
              microseconds:
                  const Duration(hours: 24).inMicroseconds + deviation,
            ),
          );
          final projection = readerSummaryTopPostsProjection(summary);

          expect(projection.curatedPosts, isEmpty);
          expect(projection.additionalNotableStories, isEmpty);
          expect(
            summary.content.promotionBoardAvailability,
            ReaderSummaryPromotionBoardAvailability.unavailable,
          );
        },
      );
    }
  }
}

ReaderSummary _mapFixture({
  required _PromotionLane lane,
  required Duration window,
  String? exactPublishedAt,
  String? exactObservedAt,
  String? exactIngestionCutoff,
}) {
  final payload =
      jsonDecode(
            jsonEncode(
              additionalStoriesRestFixture(negativeCases: const {}).toJson(),
            ),
          )
          as Map<String, dynamic>;
  final readerBrief = payload['readerBrief']! as Map<String, dynamic>;
  final laneItems = (readerBrief[lane.jsonKey]! as List<dynamic>)
      .cast<Map<String, dynamic>>();
  final card = laneItems.first;
  card['providerKey'] = 'github-repo-radar';
  card['providerName'] = 'Repo Radar';
  card['confirmedProviderKeys'] = [
    'github-repo-radar',
    ...((card['confirmedProviderKeys']! as List<dynamic>).cast<String>()).where(
      (provider) => provider != 'hacker-news',
    ),
  ];

  final attestation = card['promotionAttestation']! as Map<String, dynamic>;
  var body =
      jsonDecode(attestation['canonicalPayload']! as String)
          as Map<String, dynamic>;
  if (exactPublishedAt != null && exactObservedAt != null) {
    _alignWholeRestFixtureToExactWindow(
      payload,
      exactIngestionCutoff: exactIngestionCutoff,
    );
    body = jsonDecode(attestation['canonicalPayload']! as String)
        as Map<String, dynamic>;
    body
      ..['periodStartedAt'] = '2026-06-23T00:00:00.000Z'
      ..['periodEndedAt'] = '2026-06-24T00:00:00.000Z'
      ..['ingestionCutoff'] = DateTime.parse(
        exactIngestionCutoff ?? '2026-06-24T00:00:00.000000Z',
      ).toIso8601String()
      ..['publishedAt'] = DateTime.parse(exactPublishedAt).toIso8601String()
      ..['observedAt'] = DateTime.parse(exactObservedAt).toIso8601String();
    card['publishedAt'] = body['publishedAt'];
    body['exactPublishedAt'] = exactPublishedAt;
    body['exactObservedAt'] = exactObservedAt;
    body['exactPeriodStart'] = '2026-06-23T00:00:00.000000Z';
    body['exactPeriodEnd'] = '2026-06-24T00:00:00.000000Z';
    body['exactIngestionCutoff'] =
        exactIngestionCutoff ?? '2026-06-24T00:00:00.000000Z';
    final periodStart = DateTime.parse(body['exactPeriodStart']! as String);
    final periodEnd = DateTime.parse(body['exactPeriodEnd']! as String);
    final published = DateTime.parse(exactPublishedAt);
    final freshness = 0.10 *
        (published.difference(periodStart).inMicroseconds /
                periodEnd.difference(periodStart).inMicroseconds)
            .clamp(0, 1);
    final usefulness =
        body['usefulnessComponents']! as Map<String, dynamic>;
    usefulness['freshness'] = freshness;
    usefulness['total'] = usefulness.entries
        .where((entry) => entry.key != 'total')
        .fold<double>(
          0,
          (sum, entry) => sum + (entry.value! as num).toDouble(),
        );
  }
  final windowEnd = DateTime.parse(body['ingestionCutoff']! as String);
  body['provider'] = 'github-repo-radar';
  body['contentKind'] = 'repository';
  body['checkedAt'] = windowEnd.toIso8601String();
  body['metrics'] = {
    'provider': 'github_radar',
    'snapshotKind': 'repository_growth',
    'windowStartedAt': windowEnd.subtract(window).toIso8601String(),
    'windowEndedAt': windowEnd.toIso8601String(),
    'starsDelta': lane == _PromotionLane.top ? 50 : 25,
    'forksDelta': 0,
  };
  final canonicalPayload = jsonEncode(body);
  attestation['canonicalPayload'] = canonicalPayload;
  attestation['digest'] = sha256
      .convert(utf8.encode(canonicalPayload))
      .toString();

  final storyClusterId = body['canonicalIdentity']! as String;
  final primaryCitationId = (body['citationIds']! as List<dynamic>).first;
  final citations = (payload['citations']! as List<dynamic>)
      .cast<Map<String, dynamic>>();
  citations.singleWhere(
    (citation) => citation['citationId'] == primaryCitationId,
  )['providerKey'] = 'github-repo-radar';
  final clusters = (payload['storyClusters']! as List<dynamic>)
      .cast<Map<String, dynamic>>();
  final cluster = clusters.singleWhere(
    (candidate) => candidate['id'] == storyClusterId,
  );
  cluster['providerKeys'] = [
    'github-repo-radar',
    ...((cluster['providerKeys']! as List<dynamic>).cast<String>()).where(
      (provider) => provider != 'hacker-news',
    ),
  ];

  final apiSummary = const GeneratedSummaryRestMapper().readerSummary(
    generated.ReaderSummaryArtifactResponseDto.fromJson(payload),
  );
  return const SummaryMapper().readerSummaryToDomain(apiSummary);
}

void _alignWholeRestFixtureToExactWindow(
  Map<String, dynamic> payload, {
  String? exactIngestionCutoff,
}) {
  const periodStart = '2026-06-23T00:00:00.000Z';
  const periodEnd = '2026-06-24T00:00:00.000Z';
  final exactCutoff =
      exactIngestionCutoff ?? '2026-06-24T00:00:00.000000Z';
  final cutoff = DateTime.parse(exactCutoff).toIso8601String();
  const published = '2026-06-23T10:00:00.000Z';
  const observed = '2026-06-23T11:00:00.000Z';
  (payload['period']! as Map<String, dynamic>)
    ..['startedAt'] = periodStart
    ..['endedAt'] = periodEnd;
  (payload['sourceWindow']! as Map<String, dynamic>)
    ..['startedAt'] = periodStart
    ..['endedAt'] = periodEnd
    ..['ingestionCutoff'] = cutoff;
  final brief = payload['readerBrief']! as Map<String, dynamic>;
  final cards = <Map<String, dynamic>>[
    ...(brief['topReads']! as List<dynamic>).cast<Map<String, dynamic>>(),
    ...(brief['selectedPosts']! as List<dynamic>).cast<Map<String, dynamic>>(),
  ];
  for (final item in cards) {
    final attestation = item['promotionAttestation']! as Map<String, dynamic>;
    final body = jsonDecode(attestation['canonicalPayload']! as String)
        as Map<String, dynamic>;
    body
      ..['periodStartedAt'] = periodStart
      ..['periodEndedAt'] = periodEnd
      ..['ingestionCutoff'] = cutoff
      ..['publishedAt'] = published
      ..['observedAt'] = observed
      ..['exactPeriodStart'] = '2026-06-23T00:00:00.000000Z'
      ..['exactPeriodEnd'] = '2026-06-24T00:00:00.000000Z'
      ..['exactIngestionCutoff'] = exactCutoff
      ..['exactPublishedAt'] = '2026-06-23T10:00:00.000000Z'
      ..['exactObservedAt'] = '2026-06-23T11:00:00.000000Z';
    for (final support in (body['supportFacts']! as List<dynamic>)
        .cast<Map<String, dynamic>>()) {
      support
        ..['periodStart'] = periodStart
        ..['periodEnd'] = periodEnd
        ..['ingestionCutoff'] = cutoff
        ..['publishedAt'] = published
        ..['observedAt'] = observed
        ..['exactPeriodStart'] = '2026-06-23T00:00:00.000000Z'
        ..['exactPeriodEnd'] = '2026-06-24T00:00:00.000000Z'
        ..['exactIngestionCutoff'] = exactCutoff
        ..['exactPublishedAt'] = '2026-06-23T10:00:00.000000Z'
        ..['exactObservedAt'] = '2026-06-23T11:00:00.000000Z';
    }
    item['publishedAt'] = published;
    final canonicalPayload = jsonEncode(body);
    attestation['canonicalPayload'] = canonicalPayload;
    attestation['digest'] = sha256.convert(utf8.encode(canonicalPayload)).toString();
  }
}

enum _PromotionLane {
  top('topReads'),
  additional('selectedPosts');

  const _PromotionLane(this.jsonKey);

  final String jsonKey;
}
