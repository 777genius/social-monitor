import '../value_objects/topic_id.dart';
import '../value_objects/topic_lifecycle_status.dart';
import '../value_objects/topic_name.dart';

final class TopicSummary {
  const TopicSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.weeklyMentionCount,
  });

  final TopicId id;
  final TopicName name;
  final TopicLifecycleStatus status;
  final int weeklyMentionCount;
}
