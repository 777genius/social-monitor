import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding_overview.dart';
import '../contracts/source_binding_catalog.dart';
import '../queries/load_source_binding_overview_query.dart';

final class LoadSourceBindingOverviewUseCase {
  const LoadSourceBindingOverviewUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<SourceBindingOverview>> call(
    LoadSourceBindingOverviewQuery query,
  ) {
    if (!query.scope.isValid || !query.interestId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope and interest are required',
            code: 'source_binding_overview.scope_or_interest_required',
          ),
        ),
      );
    }
    return _catalog.loadSourceBindingOverview(query);
  }
}
