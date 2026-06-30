import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../../domain/entities/source_binding_overview.dart';
import '../commands/bind_source_to_interest_command.dart';
import '../commands/change_source_binding_status_command.dart';
import '../queries/list_source_bindings_query.dart';
import '../queries/load_source_binding_health_query.dart';
import '../queries/load_source_binding_overview_query.dart';

abstract interface class SourceBindingCatalog {
  Future<Result<PageResult<SourceBinding>>> listSourceBindings(
    ListSourceBindingsQuery query,
  );

  Future<Result<SourceBinding>> bindSourceToInterest(
    BindSourceToInterestCommand command,
  );

  Future<Result<SourceBinding>> changeSourceBindingStatus(
    ChangeSourceBindingStatusCommand command,
  );

  Future<Result<SourceBindingHealthSnapshot>> loadSourceBindingHealth(
    LoadSourceBindingHealthQuery query,
  );

  Future<Result<SourceBindingOverview>> loadSourceBindingOverview(
    LoadSourceBindingOverviewQuery query,
  );
}
