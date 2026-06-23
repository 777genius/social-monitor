import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/workspace_settings.dart';
import '../contracts/workspace_settings_catalog.dart';
import '../queries/load_workspace_settings_query.dart';

final class LoadWorkspaceSettingsUseCase {
  const LoadWorkspaceSettingsUseCase(this._catalog);

  final WorkspaceSettingsCatalog _catalog;

  Future<Result<WorkspaceSettings>> call(LoadWorkspaceSettingsQuery query) {
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
    return _catalog.loadSettings(query);
  }
}
