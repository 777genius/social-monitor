import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../commands/bind_source_to_interest_command.dart';
import '../contracts/source_binding_catalog.dart';

final class BindSourceToInterestUseCase {
  const BindSourceToInterestUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<SourceBinding>> call(BindSourceToInterestCommand command) {
    if (!command.scope.isValid ||
        !command.interestId.isValid ||
        !command.providerKey.isValid ||
        command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message:
                'Valid interest, provider and idempotency key are required',
            code: 'source_bindings.bind_request_invalid',
          ),
        ),
      );
    }
    return _catalog.bindSourceToInterest(command);
  }
}
