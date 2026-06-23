import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_lifecycle_status.dart';
import 'package:social_monitor_topics/src/infrastructure/mappers/topic_summary_mapper.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('maps topic summary DTO into domain language', () {
    const mapper = TopicSummaryMapper();

    final topic = mapper.toDomain(topicSummaryApiDto());

    expect(topic.id.value, 'topic-market-risk');
    expect(topic.name.value, 'Market risk');
    expect(topic.query.value, 'market risk OR volatility');
    expect(topic.status, TopicLifecycleStatus.active);
    expect(topic.weeklyMentionCount, 24);
  });

  test('maps unknown status and missing optional values safely', () {
    const mapper = TopicSummaryMapper();

    final topic = mapper.toDomain(
      topicSummaryApiDto(
        id: '  ',
        name: null,
        query: null,
        status: 'paused_by_provider',
        weeklyMentionCount: null,
      ),
    );

    expect(topic.id.value, 'topic-unknown');
    expect(topic.name.value, 'Untitled topic');
    expect(topic.query.value, 'No query available');
    expect(topic.status, TopicLifecycleStatus.unknown);
    expect(topic.weeklyMentionCount, 0);
  });
}
