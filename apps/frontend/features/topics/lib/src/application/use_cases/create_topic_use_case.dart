import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../commands/create_topic_command.dart';
import '../contracts/topic_catalog.dart';

final class CreateTopicUseCase {
  const CreateTopicUseCase(this._catalog);

  final TopicCatalog _catalog;

  Future<Result<TopicSummary>> call(CreateTopicCommand command) {
    final failure = _validate(
      scope: command.scope,
      isNameValid: command.name.isValid,
      areRulesValid: command.rules.isValid,
    );
    if (failure != null) {
      return Future.value(Result.failure(failure));
    }
    return _catalog.createTopic(command);
  }
}

AppFailure? _validate({
  required WorkspaceScope scope,
  required bool isNameValid,
  required bool areRulesValid,
}) {
  if (!scope.isValid) {
    return const ValidationFailure(
      message: 'Workspace scope is required',
      code: 'topics.workspace_scope_required',
    );
  }
  if (!isNameValid) {
    return const ValidationFailure(
      message: 'Topic name must contain at least two characters',
      code: 'topics.name_invalid',
      field: 'name',
    );
  }
  if (!areRulesValid) {
    return const ValidationFailure(
      message: 'Add at least one keyword before saving the topic',
      code: 'topics.rules_invalid',
      field: 'keywords',
    );
  }
  return null;
}
