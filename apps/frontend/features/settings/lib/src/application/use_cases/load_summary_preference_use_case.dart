import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/summary_preference.dart';
import '../contracts/summary_preference_catalog.dart';
import '../queries/load_summary_preference_query.dart';

final class LoadSummaryPreferenceUseCase {
  const LoadSummaryPreferenceUseCase(this._catalog);

  final SummaryPreferenceCatalog _catalog;

  Future<Result<SummaryPreference>> call(LoadSummaryPreferenceQuery query) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'settings.workspace_scope_required',
          ),
        ),
      );
    }
    if (query.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'User is required',
            code: 'settings.summary_preference_user_required',
            field: 'userId',
          ),
        ),
      );
    }
    return _catalog.loadSummaryPreference(query);
  }
}
