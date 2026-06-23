import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_summary.dart';
import '../contracts/source_catalog.dart';
import '../queries/list_sources_query.dart';

final class ListSourcesUseCase {
  const ListSourcesUseCase(this._catalog);

  final SourceCatalog _catalog;

  Future<Result<PageResult<SourceSummary>>> call(ListSourcesQuery query) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'sources.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.listSources(query);
  }
}
