import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/save_summary_preference_command.dart';
import '../../application/queries/load_summary_preference_query.dart';
import '../api/summary_preference_api_dto.dart';

const workspaceSummaryPreferenceInterestId =
    '00000000-0000-7000-8000-000000000903';

abstract interface class SummaryPreferenceApiClient {
  Future<Result<SummaryPreferenceApiDto>> loadSummaryPreference(
    LoadSummaryPreferenceApiRequest request,
  );

  Future<Result<SummaryPreferenceApiDto>> saveSummaryPreference(
    SaveSummaryPreferenceApiRequest request,
  );
}

final class LoadSummaryPreferenceApiRequest {
  const LoadSummaryPreferenceApiRequest({
    required this.scope,
    required this.userId,
  });

  factory LoadSummaryPreferenceApiRequest.fromQuery(
    LoadSummaryPreferenceQuery query,
  ) {
    return LoadSummaryPreferenceApiRequest(
      scope: query.scope,
      userId: query.userId,
    );
  }

  final WorkspaceScope scope;
  final String userId;
}

final class SaveSummaryPreferenceApiRequest {
  const SaveSummaryPreferenceApiRequest({
    required this.scope,
    required this.userId,
    required this.preference,
  });

  factory SaveSummaryPreferenceApiRequest.fromCommand(
    SaveSummaryPreferenceCommand command,
  ) {
    return SaveSummaryPreferenceApiRequest(
      scope: command.scope,
      userId: command.userId,
      preference: SaveSummaryPreferenceApiDto(
        format: command.format,
        tone: command.tone,
        includeRisks: command.includeRisks,
        includeSourceHighlights: command.includeSourceHighlights,
        customInstructions: command.customInstructions,
      ),
    );
  }

  final WorkspaceScope scope;
  final String userId;
  final SaveSummaryPreferenceApiDto preference;
}
