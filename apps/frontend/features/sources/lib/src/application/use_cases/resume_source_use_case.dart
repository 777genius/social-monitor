import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_summary.dart';
import '../commands/resume_source_command.dart';
import '../contracts/source_catalog.dart';

final class ResumeSourceUseCase {
  const ResumeSourceUseCase(this._catalog);

  final SourceCatalog _catalog;

  Future<Result<SourceSummary>> call(ResumeSourceCommand command) {
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
    if (!command.sourceId.isValid) {
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
    return _catalog.resumeSource(command);
  }
}
