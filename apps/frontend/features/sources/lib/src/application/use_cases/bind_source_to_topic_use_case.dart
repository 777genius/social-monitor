import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../commands/bind_source_to_topic_command.dart';
import '../contracts/source_binding_catalog.dart';

final class BindSourceToTopicUseCase {
  const BindSourceToTopicUseCase(this._catalog);

  final SourceBindingCatalog _catalog;

  Future<Result<SourceBinding>> call(BindSourceToTopicCommand command) {
    if (!command.scope.isValid ||
        !command.topicId.isValid ||
        !command.providerKey.isValid ||
        command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Valid topic, provider and idempotency key are required',
            code: 'source_bindings.bind_request_invalid',
          ),
        ),
      );
    }
    return _catalog.bindSourceToTopic(command);
  }
}
