import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_id.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_lifecycle_status.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_name.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_query.dart';
import 'package:social_monitor_interests/src/infrastructure/api/interest_summary_api_dto.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

const testWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

InterestSummaryApiDto interestSummaryApiDto({
  String id = 'interest-market-risk',
  String? name = 'Market risk',
  String? query = 'market risk OR volatility',
  String status = 'active',
  int? weeklyMentionCount = 24,
}) {
  return InterestSummaryApiDto(
    id: id,
    name: name,
    query: query,
    status: status,
    weeklyMentionCount: weeklyMentionCount,
  );
}

InterestSummary interestSummary({
  String id = 'interest-market-risk',
  String name = 'Market risk',
  String query = 'market risk OR volatility',
  InterestLifecycleStatus status = InterestLifecycleStatus.active,
  int weeklyMentionCount = 24,
}) {
  return InterestSummary(
    id: InterestId(id),
    name: InterestName(name),
    query: InterestQuery(query),
    status: status,
    weeklyMentionCount: weeklyMentionCount,
  );
}

PageResult<InterestSummary> interestSummaryPage(List<InterestSummary> items) {
  return PageResult<InterestSummary>(
    items: items,
    request: const PageRequest(),
  );
}
