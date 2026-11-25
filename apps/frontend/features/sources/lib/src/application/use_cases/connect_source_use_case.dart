import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_summary.dart';
import '../commands/connect_source_command.dart';
import '../contracts/source_catalog.dart';

final class ConnectSourceUseCase {
  const ConnectSourceUseCase(this._catalog);

  final SourceCatalog _catalog;

  Future<Result<SourceSummary>> call(ConnectSourceCommand command) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'sources.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.providerKey.trim().isEmpty ||
        command.displayName.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Provider and display name are required',
            code: 'sources.connect_invalid',
          ),
        ),
      );
    }
    return _catalog.connectSource(command);
  }
}
