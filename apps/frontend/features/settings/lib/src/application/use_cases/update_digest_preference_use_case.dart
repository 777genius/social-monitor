import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/workspace_settings.dart';
import '../../domain/value_objects/digest_frequency.dart';
import '../commands/update_digest_preference_command.dart';
import '../contracts/workspace_settings_catalog.dart';

final class UpdateDigestPreferenceUseCase {
  const UpdateDigestPreferenceUseCase(this._catalog);

  final WorkspaceSettingsCatalog _catalog;

  Future<Result<WorkspaceSettings>> call(
    UpdateDigestPreferenceCommand command,
  ) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'settings.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.frequency == DigestFrequency.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose a valid digest frequency',
            code: 'settings.digest_frequency_invalid',
            field: 'frequency',
          ),
        ),
      );
    }
    return _catalog.updateDigestPreference(command);
  }
}
