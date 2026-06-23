import '../value_objects/topic_id.dart';
import '../value_objects/topic_lifecycle_status.dart';
import '../value_objects/topic_name.dart';
import '../value_objects/topic_query.dart';

final class TopicSummary {
  const TopicSummary({
    required this.id,
    required this.name,
    required this.query,
    required this.status,
    required this.weeklyMentionCount,
  });

  final TopicId id;
  final TopicName name;
  final TopicQuery query;
  final TopicLifecycleStatus status;
  final int weeklyMentionCount;
}
