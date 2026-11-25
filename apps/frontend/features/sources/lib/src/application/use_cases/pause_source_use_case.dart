import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_summary.dart';
import '../commands/pause_source_command.dart';
import '../contracts/source_catalog.dart';

final class PauseSourceUseCase {
  const PauseSourceUseCase(this._catalog);

  final SourceCatalog _catalog;

  Future<Result<SourceSummary>> call(PauseSourceCommand command) {
    final failure = _validate(command.scope, command.sourceId.isValid);
    if (failure != null) {
      return Future.value(Result.failure(failure));
    }
    return _catalog.pauseSource(command);
  }
}

AppFailure? _validate(WorkspaceScope scope, bool hasSourceId) {
  if (!scope.isValid) {
    return const ValidationFailure(
      message: 'Workspace scope is required',
      code: 'sources.workspace_scope_required',
    );
  }
  if (!hasSourceId) {
    return const ValidationFailure(
      message: 'Source id is required',
      code: 'sources.id_required',
      field: 'sourceId',
    );
  }
  return null;
}
