import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_id.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_lifecycle_status.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_name.dart';
import 'package:social_monitor_topics/src/infrastructure/api/topic_summary_api_dto.dart';

const testWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

TopicSummaryApiDto topicSummaryApiDto({
  String id = 'topic-market-risk',
  String? name = 'Market risk',
  String status = 'active',
  int? weeklyMentionCount = 24,
}) {
  return TopicSummaryApiDto(
    id: id,
    name: name,
    status: status,
    weeklyMentionCount: weeklyMentionCount,
  );
}

TopicSummary topicSummary({
  String id = 'topic-market-risk',
  String name = 'Market risk',
  TopicLifecycleStatus status = TopicLifecycleStatus.active,
  int weeklyMentionCount = 24,
}) {
  return TopicSummary(
    id: TopicId(id),
    name: TopicName(name),
    status: status,
    weeklyMentionCount: weeklyMentionCount,
  );
}

PageResult<TopicSummary> topicSummaryPage(List<TopicSummary> items) {
  return PageResult<TopicSummary>(items: items, request: const PageRequest());
}
