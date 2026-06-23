import '../../application/commands/archive_topic_command.dart';
import '../../application/commands/create_topic_command.dart';
import '../../application/commands/update_topic_command.dart';
import '../api/topic_mutation_api_dto.dart';

final class TopicMutationMapper {
  const TopicMutationMapper();

  CreateTopicApiRequestDto createRequest(CreateTopicCommand command) {
    return CreateTopicApiRequestDto(
      scope: command.scope,
      name: command.name.normalized,
      query: command.query.normalized,
      idempotencyKey: command.idempotencyKey,
    );
  }

  UpdateTopicApiRequestDto updateRequest(UpdateTopicCommand command) {
    return UpdateTopicApiRequestDto(
      scope: command.scope,
      id: command.topicId.value,
      name: command.name.normalized,
      query: command.query.normalized,
    );
  }

  ArchiveTopicApiRequestDto archiveRequest(ArchiveTopicCommand command) {
    return ArchiveTopicApiRequestDto(id: command.topicId.value);
  }
}
