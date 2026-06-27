import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/topic_mutation_api_dto.dart';
import '../api/topic_summary_api_dto.dart';

final class GeneratedTopicRestMapper {
  const GeneratedTopicRestMapper();

  ListTopicsApiResponseDto listTopics(generated.ListTopicsResponseDto dto) {
    return ListTopicsApiResponseDto(
      items: dto.topics.map(topic).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  TopicSummaryApiDto topic(generated.TopicResponseDto dto) {
    return TopicSummaryApiDto(
      id: dto.id,
      name: dto.name,
      query: dto.query,
      status: dto.status.json ?? 'unknown',
      weeklyMentionCount: null,
    );
  }

  generated.CreateTopicRequestDto createTopic(
    CreateTopicApiRequestDto request,
  ) {
    return generated.CreateTopicRequestDto(
      name: request.name,
      query: request.query,
    );
  }

  TopicSummaryApiDto createdTopic(
    generated.CreateTopicResponseDto dto,
    CreateTopicApiRequestDto request,
  ) {
    return TopicSummaryApiDto(
      id: dto.topicId,
      name: request.name,
      query: request.query,
      status: dto.created ? 'active' : 'active',
      weeklyMentionCount: null,
    );
  }

  generated.UpdateTopicRequestDto updateTopic(
    UpdateTopicApiRequestDto request,
  ) {
    return generated.UpdateTopicRequestDto(
      name: request.name,
      query: request.query,
    );
  }
}
