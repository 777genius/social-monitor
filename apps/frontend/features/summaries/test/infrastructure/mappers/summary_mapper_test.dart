import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_generation_status.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('maps unknown generation status and redacts citation snippets', () {
    const mapper = SummaryMapper();

    final summary = mapper.toDomain(
      summaryApiDto(
        status: 'provider_custom',
        bodyText: 'Body includes Bearer demo and sk-demo',
        citations: [
          summaryCitationApiDto(
            rawSnippet: 'Citation includes Bearer demo and sk-demo',
          ),
        ],
      ),
    );

    expect(summary.status, SummaryGenerationStatus.unknown);
    expect(summary.bodyPreview, contains('[redacted]'));
    expect(summary.bodyPreview, isNot(contains('Bearer demo')));
    expect(summary.bodyPreview, isNot(contains('sk-demo')));
    expect(summary.citations.single.safeSnippet, contains('[redacted]'));
    expect(
      summary.citations.single.safeSnippet,
      isNot(contains('Bearer demo')),
    );
  });

  test('keeps safe citation URLs and strips URL secrets', () {
    const mapper = SummaryMapper();

    final summary = mapper.toDomain(
      summaryApiDto(
        citations: [
          summaryCitationApiDto(
            canonicalUrl:
                'https://user:pass@github.com/openai/codex?api_key=fixture&utm_source=feed#readme',
          ),
        ],
      ),
    );

    expect(
      summary.citations.single.canonicalUrl,
      'https://github.com/openai/codex?utm_source=feed',
    );
  });

  test('drops unsupported citation URL schemes', () {
    const mapper = SummaryMapper();

    final summary = mapper.toDomain(
      summaryApiDto(
        citations: [summaryCitationApiDto(canonicalUrl: 'javascript:alert(1)')],
      ),
    );

    expect(summary.citations.single.canonicalUrl, isNull);
  });

  test('maps reader summary content and sanitizes action URLs', () {
    const mapper = SummaryMapper();

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'openai/codex',
              providerKey: 'github-repo-radar',
              reason: 'Fast repo growth.',
              matchedTopicIds: ['ai-tools'],
              matchedRules: ['topic:ai-tools'],
              signalScore: 1.23,
              providerMetrics: [
                ProviderMetricApiDto(label: 'Stars', value: '54,000'),
              ],
              whyImportant: ['Fast repo growth.'],
              whyNow: 'Current summary window has Repo Radar coverage.',
              canonicalUrl:
                  'https://github.com/openai/codex?token=secret&utm_source=feed',
              citationIds: ['bc-1'],
            ),
          ],
        ),
      ),
    );

    expect(summary.content.headline, 'AI workspace summary');
    expect(
      summary.content.topReads.single.canonicalUrl,
      'https://github.com/openai/codex?utm_source=feed',
    );
    expect(summary.content.topReads.single.signalScore.value, 1.23);
    expect(summary.period.cadence.name, 'daily');
    expect(summary.summaryWindow.label, 'Evidence window');
    expect(summary.summaryWindow.startsAt, DateTime.utc(2026, 6, 26, 8, 30));
    expect(summary.summaryWindow.endsAt, DateTime.utc(2026, 6, 26, 18, 58));
    expect(
      summary.content.topReads.single.providerMetrics.single.value,
      '54,000',
    );
    expect(
      summary.content.nextActions.map((action) => action.kind),
      containsAll(['watch_repository', 'mark_relevant', 'mark_not_relevant']),
    );
  });
}
