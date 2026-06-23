import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_generation_status.dart';
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
}
