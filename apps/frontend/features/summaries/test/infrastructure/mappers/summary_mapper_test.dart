import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
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
              matchedInterestIds: ['ai-tools'],
              matchedRules: ['interest:ai-tools'],
              signalScore: 1.23,
              providerMetrics: [
                ProviderMetricApiDto(label: 'Stars', value: '54,000'),
              ],
              whyImportant: ['Fast repo growth.'],
              whyNow: 'Current summary window has Repo Radar coverage.',
              canonicalUrl:
                  'https://github.com/openai/codex?token=secret&utm_source=feed',
              previewMedia: PreviewMediaApiDto(
                kind: 'video',
                url: 'https://cdn.example.test/poster.jpg?api_key=secret',
                sourceUrl: 'https://cdn.example.test/video.mp4',
                altText: 'Preview with Bearer demo',
              ),
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
    expect(
      summary.content.topReads.single.previewMedia?.kind,
      PreviewMediaKind.video,
    );
    expect(
      summary.content.topReads.single.previewMedia?.url,
      'https://cdn.example.test/poster.jpg',
    );
    expect(
      summary.content.topReads.single.previewMedia?.sourceUrl,
      'https://cdn.example.test/video.mp4',
    );
    expect(
      summary.content.topReads.single.previewMedia?.altText,
      'Preview with [redacted]',
    );
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

  test('keeps reader summary takeaway readable without truncating words', () {
    const mapper = SummaryMapper();
    final longTakeaway = [
      'HN and RSS both surface ZCode as Claude Code from the Makers of GLM.',
      'ClaudeOfficial says Fable 5 returned after updated cybersecurity safeguards.',
      'Reddit replies add context about no usage reset, guardrails and fallback frustration.',
      'The takeaway also redacts Bearer demo and sk-demo before display.',
    ].join(' ');

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(oneLineTakeaway: longTakeaway),
      ),
    );

    expect(
      summary.content.oneLineTakeaway,
      contains('updated cybersecurity safeguards'),
    );
    expect(summary.content.oneLineTakeaway, contains('[redacted]'));
    expect(summary.content.oneLineTakeaway, isNot(contains('Bearer demo')));
    expect(summary.content.oneLineTakeaway, isNot(contains('sk-demo')));
    expect(summary.content.oneLineTakeaway, isNot(contains('c...')));
  });

  test('keeps reader summary executive summary complete', () {
    const mapper = SummaryMapper();
    final executiveSummary = [
      '**Fable 5** is the main live signal: Reddit discussion says the model is back with intense user interest.',
      'Parallel LocalLLaMA threads push a broader theme around reproducible local pipelines and clearer model boundaries.',
      'HN and RSS add a coding-agent backdrop, while caveats stay attached to source-reported claims.',
    ].join(' ');

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(executiveSummary: executiveSummary),
    );

    expect(summary.executiveSummary, contains('reproducible local pipelines'));
    expect(summary.executiveSummary, contains('source-reported claims'));
    expect(summary.executiveSummary, isNot(contains('...')));
  });
}
