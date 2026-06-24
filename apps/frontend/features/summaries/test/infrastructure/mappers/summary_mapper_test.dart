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

  test('maps reader brief and sanitizes action URLs', () {
    const mapper = SummaryMapper();

    final briefing = mapper.briefingToDomain(
      briefingApiDto(
        readerBrief: briefingReaderBriefApiDto(
          topReads: const [
            BriefingReaderItemApiDto(
              title: 'openai/codex',
              providerKey: 'github-repo-radar',
              reason: 'Fast repo growth.',
              matchedTopicIds: ['ai-tools'],
              matchedRules: ['topic:ai-tools'],
              signalScore: 1.23,
              providerMetrics: [
                BriefingProviderMetricApiDto(label: 'Stars', value: '54,000'),
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

    expect(briefing.readerBrief.headline, 'AI workspace summary');
    expect(
      briefing.readerBrief.topReads.single.canonicalUrl,
      'https://github.com/openai/codex?utm_source=feed',
    );
    expect(briefing.readerBrief.topReads.single.signalScore, 1.23);
    expect(
      briefing.readerBrief.topReads.single.providerMetrics.single.value,
      '54,000',
    );
    expect(
      briefing.readerBrief.nextActions.map((action) => action.kind),
      containsAll(['watch_repository', 'mark_relevant', 'mark_not_relevant']),
    );
  });
}
