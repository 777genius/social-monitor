import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../contracts/interest_catalog.dart';
import '../queries/list_interests_query.dart';

final class ListInterestsUseCase {
  const ListInterestsUseCase(this._catalog);

  final InterestCatalog _catalog;

  Future<Result<PageResult<InterestSummary>>> call(
    ListInterestsQuery query,
  ) async {
    final normalized = query.normalized();
    if (!normalized.scope.isValid) {
      return const Result.failure(
        ValidationFailure(
          message: 'Workspace scope is required to list interests',
          code: 'interests.workspace_scope_required',
        ),
      );
    }

    return _catalog.listInterests(normalized);
  }
}
