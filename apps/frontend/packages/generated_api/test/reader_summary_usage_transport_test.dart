import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  group('reader summary usage transport', () {
    test('preserves historical incomplete null token counts', () {
      final usage = ReaderSummaryUsageDto.fromJson({
        'estimatedCostUsd': 0,
        'inputTokens': null,
        'outputTokens': null,
      });

      expect(usage.inputTokens, isNull);
      expect(usage.outputTokens, isNull);
      expect(usage.toJson(), {
        'estimatedCostUsd': 0,
        'inputTokens': null,
        'outputTokens': null,
      });
    });

    test('preserves provider-reported token counts', () {
      final usage = ReaderSummaryUsageDto.fromJson({
        'estimatedCostUsd': 0.0042,
        'inputTokens': 1250,
        'outputTokens': 375,
      });

      expect(usage.inputTokens, 1250);
      expect(usage.outputTokens, 375);
      expect(usage.toJson(), {
        'estimatedCostUsd': 0.0042,
        'inputTokens': 1250,
        'outputTokens': 375,
      });
    });
  });
}
