import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_interest_id.dart';

final class LoadSourceBindingOverviewQuery {
  const LoadSourceBindingOverviewQuery({
    required this.scope,
    required this.interestId,
    this.page = const PageRequest(),
  });

  final WorkspaceScope scope;
  final SourceInterestId interestId;
  final PageRequest page;
}
