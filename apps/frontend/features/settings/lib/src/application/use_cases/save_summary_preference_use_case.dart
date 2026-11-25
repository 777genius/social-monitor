import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/summary_preference.dart';
import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';
import '../commands/save_summary_preference_command.dart';
import '../contracts/summary_preference_catalog.dart';

final class SaveSummaryPreferenceUseCase {
  const SaveSummaryPreferenceUseCase(this._catalog);

  final SummaryPreferenceCatalog _catalog;

  Future<Result<SummaryPreference>> call(SaveSummaryPreferenceCommand command) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'settings.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'User is required',
            code: 'settings.summary_preference_user_required',
            field: 'userId',
          ),
        ),
      );
    }
    if (command.format == SummaryPreferenceFormat.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose a valid summary format',
            code: 'settings.summary_preference_format_invalid',
            field: 'format',
          ),
        ),
      );
    }
    if (command.tone == SummaryPreferenceTone.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose a valid summary tone',
            code: 'settings.summary_preference_tone_invalid',
            field: 'tone',
          ),
        ),
      );
    }
    if (command.customInstructions.trim().length >
        SummaryPreference.maxCustomInstructionsLength) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Custom prompt is too long',
            code: 'settings.summary_preference_prompt_too_long',
            field: 'customInstructions',
          ),
        ),
      );
    }
    return _catalog.saveSummaryPreference(command);
  }
}
