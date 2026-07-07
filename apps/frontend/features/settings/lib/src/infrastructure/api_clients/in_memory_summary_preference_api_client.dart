import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/summary_preference_api_dto.dart';
import 'summary_preference_api_client.dart';

final class InMemorySummaryPreferenceApiClient
    implements SummaryPreferenceApiClient {
  InMemorySummaryPreferenceApiClient({SummaryPreferenceApiDto? preference})
    : _preference =
          preference ??
          const SummaryPreferenceApiDto(
            format: null,
            tone: null,
            includeRisks: null,
            includeSourceHighlights: null,
            customInstructions: null,
            source: 'none',
          );

  SummaryPreferenceApiDto _preference;

  @override
  Future<Result<SummaryPreferenceApiDto>> loadSummaryPreference(
    LoadSummaryPreferenceApiRequest request,
  ) async {
    final failure = _failureFor(request.scope, request.userId);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.success(_preference);
  }

  @override
  Future<Result<SummaryPreferenceApiDto>> saveSummaryPreference(
    SaveSummaryPreferenceApiRequest request,
  ) async {
    final failure = _failureFor(request.scope, request.userId);
    if (failure != null) {
      return Result.failure(failure);
    }
    _preference = SummaryPreferenceApiDto(
      format: request.preference.format.name,
      tone: request.preference.tone.name,
      includeRisks: request.preference.includeRisks,
      includeSourceHighlights: request.preference.includeSourceHighlights,
      customInstructions: request.preference.customInstructions,
      source: 'interest',
      updatedAt: DateTime.utc(2026, 7, 6),
    );
    return Result.success(_preference);
  }

  AppFailure? _failureFor(WorkspaceScope scope, String userId) {
    if (!scope.isValid) {
      return const ApiProblem(
        title: 'Workspace required',
        status: 403,
        detail: 'A valid workspace is required to load summary preferences',
      ).toFailure();
    }
    if (userId.trim().isEmpty) {
      return const ValidationFailure(
        message: 'User is required',
        code: 'settings.summary_preference_user_required',
      );
    }
    return null;
  }
}
