import '../value_objects/interest_id.dart';
import '../value_objects/interest_lifecycle_status.dart';
import '../value_objects/interest_name.dart';
import '../value_objects/interest_query.dart';

final class InterestSummary {
  const InterestSummary({
    required this.id,
    required this.name,
    required this.query,
    required this.status,
    required this.weeklyMentionCount,
  });

  final InterestId id;
  final InterestName name;
  final InterestQuery query;
  final InterestLifecycleStatus status;
  final int weeklyMentionCount;
}
