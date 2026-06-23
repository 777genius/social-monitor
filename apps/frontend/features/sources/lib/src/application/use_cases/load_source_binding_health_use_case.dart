import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding_health_snapshot.dart';
import '../contracts/source_binding_catalog.dart';
import '../queries/load_source_binding_health_query.dart';

final class LoadSourceBindingHealthUseCase {
  const LoadSourceBindingHealthUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<SourceBindingHealthSnapshot>> call(
    LoadSourceBindingHealthQuery query,
  ) {
    if (!query.scope.isValid ||
        !query.topicId.isValid ||
        !query.sourceBindingId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope, topic and binding are required',
            code: 'source_bindings.health_request_invalid',
          ),
        ),
      );
    }
    return _catalog.loadSourceBindingHealth(query);
  }
}
