import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../commands/update_interest_command.dart';
import '../contracts/interest_catalog.dart';

final class UpdateInterestUseCase {
  const UpdateInterestUseCase(this._catalog);

  final InterestCatalog _catalog;

  Future<Result<InterestSummary>> call(UpdateInterestCommand command) {
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
    if (!command.name.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Interest name must contain at least two characters',
            code: 'interests.name_invalid',
            field: 'name',
          ),
        ),
      );
    }
    if (!command.query.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Interest query must contain at least two characters',
            code: 'interests.query_invalid',
            field: 'query',
          ),
        ),
      );
    }
    return _catalog.updateInterest(command);
  }
}
