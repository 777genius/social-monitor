import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_topics/src/infrastructure/api/topic_mutation_api_dto.dart';
import 'package:social_monitor_topics/src/infrastructure/mappers/generated_topic_rest_mapper.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('maps generated topic list DTOs into feature API DTOs', () {
    const mapper = GeneratedTopicRestMapper();

    final response = mapper.listTopics(
      generated.ListTopicsResponseDto(
        topics: [
          generated.TopicResponseDto(
            id: 'topic-pricing',
            tenantId: 'tenant-demo',
            workspaceId: 'workspace-demo',
            name: 'Competitor pricing',
            query: 'pricing OR plan change',
            createdAt: DateTime.utc(2026, 6, 23),
          ),
        ],
        nextCursor: 'cursor-2',
      ),
    );

    expect(response.nextCursor, 'cursor-2');
    expect(response.items.single.id, 'topic-pricing');
    expect(response.items.single.name, 'Competitor pricing');
    expect(response.items.single.query, 'pricing OR plan change');
  });

  test('maps create request and optimistic create response', () {
    const mapper = GeneratedTopicRestMapper();
    const request = CreateTopicApiRequestDto(
      scope: testWorkspaceScope,
      name: 'Competitor launches',
      query: 'launch OR beta',
      idempotencyKey: 'topic-create-1',
    );

    final generatedRequest = mapper.createTopic(request);
    final created = mapper.createdTopic(
      const generated.CreateTopicResponseDto(
        topicId: 'topic-created',
        created: true,
      ),
      request,
    );

    expect(generatedRequest.name, 'Competitor launches');
    expect(generatedRequest.query, 'launch OR beta');
    expect(created.id, 'topic-created');
    expect(created.query, 'launch OR beta');
  });
}
