import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_period.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';

final class ListReaderPostsQuery {
  const ListReaderPostsQuery({
    required this.scope,
    required this.period,
    required this.order,
    this.excludedProviders = const {},
    this.cursor,
  });

  final WorkspaceScope scope;
  final SummaryPeriod period;
  final TopPostsSortOrder order;
  final Set<String> excludedProviders;
  final String? cursor;
}
