import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_sentiment.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_triage_state.dart';
import 'package:social_monitor_feed/src/infrastructure/mappers/feed_mention_mapper.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  test('maps unknown enum values and redacts unsafe evidence preview', () {
    const mapper = FeedMentionMapper();

    final mention = mapper.toDomain(
      feedMentionApiDto(
        sentiment: 'provider_custom',
        triageState: 'provider_custom',
        rawEvidenceText: 'Authorization Bearer demo and provider key sk-demo',
      ),
    );

    expect(mention.sentiment, MentionSentiment.unknown);
    expect(mention.triageState, MentionTriageState.unknown);
    expect(mention.safeEvidencePreview, contains('[redacted]'));
    expect(mention.safeEvidencePreview, isNot(contains('Bearer demo')));
    expect(mention.safeEvidencePreview, isNot(contains('sk-demo')));
  });
}
