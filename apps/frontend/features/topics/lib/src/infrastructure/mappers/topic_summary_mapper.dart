import '../../domain/entities/topic_summary.dart';
import '../../domain/value_objects/topic_id.dart';
import '../../domain/value_objects/topic_lifecycle_status.dart';
import '../../domain/value_objects/topic_name.dart';
import '../api/topic_summary_api_dto.dart';

final class TopicSummaryMapper {
  const TopicSummaryMapper();

  TopicSummary toDomain(TopicSummaryApiDto dto) {
    return TopicSummary(
      id: TopicId(_nonEmpty(dto.id, fallback: 'topic-unknown')),
      name: TopicName(_nonEmpty(dto.name, fallback: 'Untitled topic')),
      status: _statusFromApi(dto.status),
      weeklyMentionCount: (dto.weeklyMentionCount ?? 0).clamp(0, 1 << 31),
    );
  }

  TopicLifecycleStatus _statusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'active' => TopicLifecycleStatus.active,
      'draft' => TopicLifecycleStatus.draft,
      'archived' => TopicLifecycleStatus.archived,
      _ => TopicLifecycleStatus.unknown,
    };
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
