import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_display_headline_verifier.dart';

import '../../support/reader_display_headline_parity_fixture.dart';

void main() {
  for (final example in displayParityCases()) {
    test(example.name, () {
      final fixture = example.fixture;
      final before = jsonEncode(fixture);
      final headline = fixture['headline']! as Map<String, Object?>;
      expect(
        verifyReaderDisplayHeadline(
          payload: fixture['payload']! as Map<String, Object?>,
          headline: headline,
          source: fixture['source'],
          outerSeal: fixture['seal'],
          title: headline['text']! as String,
          providerKey: 'reddit',
          tenantId: 'tenant-fixture',
          workspaceId: 'workspace-fixture',
          sourceItemId: 'source-fixture',
          sourceCandidateId: 'candidate-fixture',
        ),
        example.accepted,
      );
      expect(jsonEncode(fixture), before, reason: 'No trim, dedupe or repair');
    });
  }
  test('Dart JSON quote encoding matches JS UTF-16 budget vectors', () {
    // Expected encodings from JSON.stringify, including surrounding quotes.
    const vectors = <String, String>{
      '\b\t\n\f\r"\\/': r'"\b\t\n\f\r\"\\/"',
      '\u0001\u001f': r'"\u0001\u001f"',
      '\u2028\u2029': '"\u2028\u2029"',
      'e\u0301漢🚀': '"e\u0301漢🚀"',
      '\u0085\ufeff': '"\u0085\ufeff"',
    };
    for (final entry in vectors.entries) {
      expect(jsonEncode(entry.key).codeUnits, entry.value.codeUnits);
    }
    expect('🚀'.length, 2);
    expect(jsonEncode('🚀').length, 4);
  });
}
