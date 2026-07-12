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
    expect(summary.content.topicMap.generatedBy, 'agent-runtime');
    expect(summary.content.topicMap.confidence.level, 'high');
    expect(
      summary.content.topicMap.nodes.map((node) => node.label),
      containsAll(['AI tools', 'Codex']),
    );
    expect(
      summary.content.topicMap.groups.map((group) => group.label),
      contains('Agent tools'),
    );
    expect(summary.content.topicMap.edges.single.weight, 0.8);
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

  test('maps degraded provider collection health into domain coverage', () {
    const mapper = SummaryMapper();

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: ReaderSummaryCoverageApiDto(
          selectedFeedItemCount: 18,
          topReadCount: 7,
          citationCount: 30,
          collectedFeedItemCount: 52,
          collectionCoverageState: 'degraded',
          degradedProviderKeys: const ['x-twitter'],
          providerBreakdown: [
            ReaderSummaryProviderCoverageApiDto(
              providerKey: 'x-twitter',
              selectedFeedItemCount: 8,
              topReadCount: 2,
              citationCount: 10,
              collectedFeedItemCount: 12,
              collectionHealth: ReaderSummaryProviderCollectionHealthApiDto(
                state: 'degraded',
                scanCount: 1,
                targetItemCount: 80,
                collectedItemCount: 16,
                acceptedItemCount: 12,
                insertedItemCount: 10,
                outsideWindowItemCount: 4,
                paginationDuplicateItemCount: 2,
                storageDuplicateItemCount: 2,
                pageCount: 2,
                paginationStopReasons: const ['partial_retryable_failure'],
                failureKinds: const ['rate_limited'],
                rateLimitEventCount: 1,
                newestAcceptedPublishedAt: DateTime.utc(2026, 7, 9, 22),
              ),
            ),
          ],
        ),
      ),
    );

    expect(
      summary.coverage?.collectionCoverageState,
      ReaderSummaryCollectionCoverageState.degraded,
    );
    expect(summary.coverage?.degradedProviderKeys, ['x-twitter']);
    expect(
      summary.coverage?.providerBreakdown.single.collectionHealth?.state,
      ReaderSummaryCollectionCoverageState.degraded,
    );
    expect(
      summary
          .coverage
          ?.providerBreakdown
          .single
          .collectionHealth
          ?.targetItemCount,
      80,
    );
    expect(
      summary
          .coverage
          ?.providerBreakdown
          .single
          .collectionHealth
          ?.rateLimitEventCount,
      1,
    );
    expect(
      summary.coverage?.providerBreakdown.single.collectionHealth?.failureKinds,
      ['rate_limited'],
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

  test('keeps complete top read descriptions up to the backend limit', () {
    const mapper = SummaryMapper();
    final description = [
      'OpenAI says the work agent can continue multi-step projects across connected apps and files.',
      'The release moves the product beyond isolated coding tasks into longer operational workflows.',
      'That matters for teams delegating research, document updates and follow-up actions without rebuilding context for every step.',
      'Access scope and real-world reliability still need careful evaluation.',
    ].join(' ');

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              title: 'A work agent for longer operational projects',
              providerKey: 'x-twitter',
              reason: description,
              whyImportant: [description],
              matchedInterestIds: const ['ai-developer-tools'],
              signalScore: 3.2,
              citationIds: const ['long-description-citation'],
            ),
          ],
        ),
      ),
    );

    expect(description.length, greaterThan(240));
    expect(summary.content.topReads.single.reason, description);
    expect(summary.content.topReads.single.whyImportant.single, description);
  });

  test('maps typed GitHub Trending ranking and language scope', () {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              title: 'example/repository',
              providerKey: 'github-trending-page',
              reason: 'Trending repository.',
              citationIds: const ['github-trending-citation'],
              providerRanking: GitHubTrendingRankingApiDto(
                position: 3,
                starsGained: 420,
                window: 'daily',
                capturedAt: DateTime.parse('2026-07-12T09:00:00.000Z'),
                programmingLanguage: 'TypeScript',
                spokenLanguage: 'en',
              ),
            ),
          ],
        ),
      ),
    );

    final ranking = summary.content.topReads.single.providerRanking;
    expect(ranking?.position, 3);
    expect(ranking?.starsGained, 420);
    expect(ranking?.window, GitHubTrendingWindow.daily);
    expect(ranking?.scope.programmingLanguage, 'TypeScript');
    expect(ranking?.scope.spokenLanguage, 'en');
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

  test('preserves structured reader summary markdown paragraphs', () {
    const mapper = SummaryMapper();
    final executiveSummary = [
      '**AI-agent workflows** dominated the day across X, Reddit and HN.',
      '',
      'The main product signal is practical workflow sharing, while policy and platform-risk stories cut through as separate themes.',
      '- Claude/Codex users are sharing prompt-loop and debugging patterns.',
      '- EU surveillance coverage is cross-source but still needs careful reading.',
      '- Bearer demo and sk-demo must be redacted without flattening structure.',
    ].join('\n');

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(executiveSummary: executiveSummary),
    );

    expect(summary.executiveSummary, contains('\n\nThe main product signal'));
    expect(summary.executiveSummary, contains('\n- Claude/Codex users'));
    expect(summary.executiveSummary, contains('[redacted]'));
    expect(summary.executiveSummary, isNot(contains('Bearer demo')));
    expect(summary.executiveSummary, isNot(contains('sk-demo')));
  });

  test('hides backend clustering terms from reader-facing summary copy', () {
    const mapper = SummaryMapper();

    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        executiveSummary:
            'Confidence is medium because the window has broad provider coverage but no backend cross-provider clusters.',
        content: readerSummaryContentApiDto(
          oneLineTakeaway:
              'No backend cross-provider clusters were detected across source families.',
        ),
      ),
    );

    expect(summary.executiveSummary, contains('broad source coverage'));
    expect(
      summary.executiveSummary,
      contains('no confirmed cross-source matches'),
    );
    expect(summary.executiveSummary, isNot(contains('backend')));
    expect(summary.executiveSummary, isNot(contains('provider coverage')));
    expect(summary.content.oneLineTakeaway, contains('source groups'));
    expect(summary.content.oneLineTakeaway, isNot(contains('backend')));
  });
}
