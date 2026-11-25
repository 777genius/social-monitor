import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_health_snapshot.dart';
import '../contracts/source_catalog.dart';
import '../queries/load_source_health_query.dart';

final class LoadSourceHealthUseCase {
  const LoadSourceHealthUseCase(this._catalog);

  final SourceCatalog _catalog;

  Future<Result<SourceHealthSnapshot>> call(LoadSourceHealthQuery query) {
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
    if (!query.sourceId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Source id is required',
            code: 'sources.id_required',
            field: 'sourceId',
          ),
        ),
      );
    }
    return _catalog.loadSourceHealth(query);
  }
}
