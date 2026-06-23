import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../contracts/source_binding_catalog.dart';
import '../queries/list_source_bindings_query.dart';

final class ListSourceBindingsUseCase {
  const ListSourceBindingsUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<PageResult<SourceBinding>>> call(
    ListSourceBindingsQuery query,
  ) {
    if (!query.scope.isValid || !query.topicId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope and topic are required',
            code: 'source_bindings.scope_or_topic_required',
          ),
        ),
      );
    }
    return _catalog.listSourceBindings(query);
  }
}
