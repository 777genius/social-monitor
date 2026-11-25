import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../commands/create_interest_command.dart';
import '../contracts/interest_catalog.dart';

final class CreateInterestUseCase {
  const CreateInterestUseCase(this._catalog);

  final InterestCatalog _catalog;

  Future<Result<InterestSummary>> call(CreateInterestCommand command) {
    final failure = _validate(
      scope: command.scope,
      isNameValid: command.name.isValid,
      isQueryValid: command.query.isValid,
      idempotencyKey: command.idempotencyKey,
    );
    if (failure != null) {
      return Future.value(Result.failure(failure));
    }
    return _catalog.createInterest(command);
  }
}

AppFailure? _validate({
  required WorkspaceScope scope,
  required bool isNameValid,
  required bool isQueryValid,
  required String idempotencyKey,
}) {
  if (!scope.isValid) {
    return const ValidationFailure(
      message: 'Workspace scope is required',
      code: 'interests.workspace_scope_required',
    );
  }
  if (!isNameValid) {
    return const ValidationFailure(
      message: 'Interest name must contain at least two characters',
      code: 'interests.name_invalid',
      field: 'name',
    );
  }
  if (!isQueryValid) {
    return const ValidationFailure(
      message: 'Interest query must contain at least two characters',
      code: 'interests.query_invalid',
      field: 'query',
    );
  }
  if (idempotencyKey.trim().isEmpty) {
    return const ValidationFailure(
      message: 'Interest create action must include an idempotency key',
      code: 'interests.idempotency_key_required',
      field: 'idempotencyKey',
    );
  }
  return null;
}
