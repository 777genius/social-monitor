import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../../domain/value_objects/source_binding_status.dart';
import '../commands/change_source_binding_status_command.dart';
import '../contracts/source_binding_catalog.dart';

final class ChangeSourceBindingStatusUseCase {
  const ChangeSourceBindingStatusUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<SourceBinding>> call(ChangeSourceBindingStatusCommand command) {
    if (!command.scope.isValid ||
        !command.interestId.isValid ||
        !command.sourceBindingId.isValid ||
        command.status == SourceBindingStatus.unknown ||
        command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Valid binding status change request is required',
            code: 'source_bindings.status_request_invalid',
          ),
        ),
      );
    }
    return _catalog.changeSourceBindingStatus(command);
  }
}
