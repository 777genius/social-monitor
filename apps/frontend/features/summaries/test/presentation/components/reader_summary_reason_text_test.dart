import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_reason_text.dart';

void main() {
  test('hides ranking telemetry from reader-facing top read reason text', () {
    final item = _topRead(
      reason: '${'Story'} signal score 2.275',
      whyImportant: const [
        'Strong source engagement signal',
        'Passes source quality and interest relevance gate',
        'Fresh item in the current monitoring window',
        'Clustered 72 similar items',
      ],
    );

    expect(
      readerSummaryDisplayReason(item),
      'Source-reported: Reddit discussion asks why AI labs are building their own chips',
    );
    expect(readerSummaryDisplayWhyImportant(item), [
      'Source-reported: Reddit discussion asks why AI labs are building their own chips',
    ]);
  });

  test('keeps concrete reader-facing top read reasons', () {
    final item = _topRead(
      reason:
          'AI infrastructure discussion around custom chips is getting practical.',
      whyImportant: const [
        'AI infrastructure discussion around custom chips is getting practical.',
      ],
    );

    expect(
      readerSummaryDisplayReason(item),
      'AI infrastructure discussion around custom chips is getting practical',
    );
    expect(readerSummaryDisplayWhyImportant(item), [
      'AI infrastructure discussion around custom chips is getting practical',
    ]);
  });
}

TopRead _topRead({required String reason, required List<String> whyImportant}) {
  return TopRead(
    title: 'Reddit discussion asks why AI labs are building their own chips',
    providerKey: 'reddit',
    reason: reason,
    matchedInterestIds: const ['ai-infrastructure'],
    matchedRules: const ['interest:ai-infrastructure'],
    signalScore: SignalScore.normalized(2.275),
    confidence: const TopReadConfidence(
      level: 'low',
      score: 0.42,
      rationale: 'Single-source story signal.',
    ),
    confirmedProviderKeys: const ['reddit'],
    providerMetrics: const [],
    whyImportant: whyImportant,
    whyNow: 'Current summary window has Reddit coverage.',
    citationIds: const ['c1'],
    canonicalUrl: 'https://reddit.example/r/localllama/comments/1',
  );
}
