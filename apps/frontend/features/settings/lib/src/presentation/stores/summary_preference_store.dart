import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/save_summary_preference_command.dart';
import '../../application/queries/load_summary_preference_query.dart';
import '../../application/use_cases/load_summary_preference_use_case.dart';
import '../../application/use_cases/save_summary_preference_use_case.dart';
import '../../domain/entities/summary_preference.dart';
import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';

final class SummaryPreferenceStore extends ChangeNotifier {
  SummaryPreferenceStore({
    required LoadSummaryPreferenceUseCase loadSummaryPreference,
    required SaveSummaryPreferenceUseCase saveSummaryPreference,
    required WorkspaceScope scope,
    required String userId,
    OperationGenerationGuard? generationGuard,
  }) : _loadSummaryPreference = loadSummaryPreference,
       _saveSummaryPreference = saveSummaryPreference,
       _scope = scope,
       _userId = userId,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final LoadSummaryPreferenceUseCase _loadSummaryPreference;
  final SaveSummaryPreferenceUseCase _saveSummaryPreference;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;
  String _userId;

  AsyncViewState<SummaryPreference> state =
      const InitialViewState<SummaryPreference>();
  AsyncViewState<SummaryPreference> saveState =
      const InitialViewState<SummaryPreference>();

  SummaryPreferenceFormat format = SummaryPreference.defaults().format;
  SummaryPreferenceTone tone = SummaryPreference.defaults().tone;
  bool includeRisks = SummaryPreference.defaults().includeRisks;
  bool includeSourceHighlights =
      SummaryPreference.defaults().includeSourceHighlights;
  String customInstructions = SummaryPreference.defaults().customInstructions;

  WorkspaceScope get scope => _scope;
  String get userId => _userId;

  ValidationFailure? get validationFailure {
    if (customInstructions.trim().length >
        SummaryPreference.maxCustomInstructionsLength) {
      return const ValidationFailure(
        message: 'Custom prompt is too long',
        code: 'settings.summary_preference_prompt_too_long',
        field: 'customInstructions',
      );
    }
    return null;
  }

  int get remainingPromptChars =>
      SummaryPreference.maxCustomInstructionsLength -
      customInstructions.trim().length;

  bool get canSave =>
      validationFailure == null &&
      format != SummaryPreferenceFormat.unknown &&
      tone != SummaryPreferenceTone.unknown;

  UserActionIntent get saveIntent {
    return UserActionIntent(
      id: 'settings.summary_preference.save',
      disabledReasonCode: canSave
          ? null
          : 'settings.summary_preference_invalid',
      idempotencyKey: '${_scope.workspaceId}:summary-preference:$_userId',
    );
  }

  void updateScope({required WorkspaceScope scope, required String userId}) {
    if (scope == _scope && userId == _userId) {
      return;
    }
    _scope = scope;
    _userId = userId;
    _generationGuard.invalidate();
    state = const InitialViewState<SummaryPreference>();
    saveState = const InitialViewState<SummaryPreference>();
    _applyPreference(SummaryPreference.defaults());
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<SummaryPreference>(:final value) => value,
      LoadingViewState<SummaryPreference>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    state = LoadingViewState<SummaryPreference>(previousValue: previous);
    notifyListeners();

    final result = await _loadSummaryPreference(
      LoadSummaryPreferenceQuery(scope: _scope, userId: _userId),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    state = result.fold(
      onSuccess: (preference) {
        _applyPreference(preference);
        return ReadyViewState<SummaryPreference>(preference);
      },
      onFailure: (failure) =>
          FailureViewState<SummaryPreference>(failure: failure),
    );
    notifyListeners();
  }

  void updateFormat(SummaryPreferenceFormat value) {
    format = value;
    notifyListeners();
  }

  void updateTone(SummaryPreferenceTone value) {
    tone = value;
    notifyListeners();
  }

  void updateIncludeRisks(bool value) {
    includeRisks = value;
    notifyListeners();
  }

  void updateIncludeSourceHighlights(bool value) {
    includeSourceHighlights = value;
    notifyListeners();
  }

  void updateCustomInstructions(String value) {
    customInstructions = value;
    notifyListeners();
  }

  void resetDraft() {
    _applyPreference(SummaryPreference.defaults());
    notifyListeners();
  }

  Future<void> save() async {
    final intent = saveIntent;
    if (!intent.isEnabled) {
      saveState = FailureViewState<SummaryPreference>(
        failure:
            validationFailure ??
            const ValidationFailure(
              message: 'Choose valid summary settings',
              code: 'settings.summary_preference_invalid',
            ),
      );
      notifyListeners();
      return;
    }

    final previous = switch (state) {
      ReadyViewState<SummaryPreference>(:final value) => value,
      _ => null,
    };
    saveState = LoadingViewState<SummaryPreference>(previousValue: previous);
    notifyListeners();

    final result = await _saveSummaryPreference(
      SaveSummaryPreferenceCommand(
        scope: _scope,
        userId: _userId,
        format: format,
        tone: tone,
        includeRisks: includeRisks,
        includeSourceHighlights: includeSourceHighlights,
        customInstructions: customInstructions,
      ),
    );

    saveState = result.fold(
      onSuccess: (preference) {
        _applyPreference(preference);
        state = ReadyViewState<SummaryPreference>(preference);
        return ReadyViewState<SummaryPreference>(preference);
      },
      onFailure: (failure) =>
          FailureViewState<SummaryPreference>(failure: failure),
    );
    notifyListeners();
  }

  void _applyPreference(SummaryPreference preference) {
    format = preference.format;
    tone = preference.tone;
    includeRisks = preference.includeRisks;
    includeSourceHighlights = preference.includeSourceHighlights;
    customInstructions = preference.customInstructions;
  }
}
