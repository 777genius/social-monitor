import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_settings/src/domain/entities/summary_preference.dart';
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_format.dart';
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_tone.dart';
import 'package:social_monitor_settings/src/infrastructure/mappers/summary_preference_mapper.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  test('maps snake case summary preference values', () {
    const mapper = SummaryPreferenceMapper();

    final preference = mapper.toDomain(
      summaryPreferenceApiDto(
        format: 'bullet_digest',
        tone: 'concise',
        includeRisks: false,
        customInstructions: 'One\nTwo',
      ),
    );

    expect(preference.format, SummaryPreferenceFormat.bulletDigest);
    expect(preference.tone, SummaryPreferenceTone.concise);
    expect(preference.includeRisks, isFalse);
    expect(preference.customInstructions, 'One\nTwo');
  });

  test('falls back to defaults for unknown wire values', () {
    const mapper = SummaryPreferenceMapper();

    final preference = mapper.toDomain(
      summaryPreferenceApiDto(format: 'verbose_report', tone: 'sales'),
    );

    expect(preference.format, SummaryPreferenceFormat.executiveBrief);
    expect(preference.tone, SummaryPreferenceTone.analytical);
  });

  test('maps none source as default preference', () {
    const mapper = SummaryPreferenceMapper();

    final preference = mapper.toDomain(summaryPreferenceApiDto(source: 'none'));

    expect(preference.source, SummaryPreferenceSource.none);
  });
}
