import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/reader_summary_claim_anchor_resolver.dart';

void main() {
  test('anchors after the uniquely matched sentence punctuation', () {
    const text = 'The first claim is supported. More context follows.';

    final end = ReaderSummaryClaimAnchorResolver.resolveEnd(
      text: text,
      claimText: 'the first claim is supported',
    );

    expect(text.substring(0, end), 'The first claim is supported.');
    expect(text.substring(end), ' More context follows.');
  });

  test('matches equivalent whitespace without changing original offsets', () {
    const text = 'A claim spans\nmultiple spaces. The paragraph continues.';

    final end = ReaderSummaryClaimAnchorResolver.resolveEnd(
      text: text,
      claimText: 'A claim spans multiple spaces.',
    );

    expect(text.substring(0, end), 'A claim spans\nmultiple spaces.');
  });

  test('falls back to paragraph end when a claim is repeated', () {
    const text = 'Repeated claim. Context. Repeated claim.';

    final end = ReaderSummaryClaimAnchorResolver.resolveEnd(
      text: text,
      claimText: 'Repeated claim.',
    );

    expect(end, text.length);
  });

  test('falls back to paragraph end when claim text does not match', () {
    const text = 'The paragraph uses materially different wording.';

    final end = ReaderSummaryClaimAnchorResolver.resolveEnd(
      text: text,
      claimText: 'A different claim.',
    );

    expect(end, text.length);
  });
}
