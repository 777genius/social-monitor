import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../commands/archive_interest_command.dart';
import '../contracts/interest_catalog.dart';

final class ArchiveInterestUseCase {
  const ArchiveInterestUseCase(this._catalog);

  final InterestCatalog _catalog;

  Future<Result<InterestSummary>> call(ArchiveInterestCommand command) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'interests.workspace_scope_required',
          ),
        ),
      );
    }
    if (!command.interestId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Interest id is required',
            code: 'interests.id_required',
            field: 'interestId',
          ),
        ),
      );
    }
    return _catalog.archiveInterest(command);
  }
}
