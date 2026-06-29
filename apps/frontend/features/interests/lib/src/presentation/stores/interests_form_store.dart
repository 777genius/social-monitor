import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/archive_interest_command.dart';
import '../../application/commands/create_interest_command.dart';
import '../../application/commands/update_interest_command.dart';
import '../../application/use_cases/archive_interest_use_case.dart';
import '../../application/use_cases/create_interest_use_case.dart';
import '../../application/use_cases/update_interest_use_case.dart';
import '../../domain/entities/interest_summary.dart';
import '../../domain/value_objects/interest_id.dart';
import '../../domain/value_objects/interest_name.dart';
import '../../domain/value_objects/interest_query.dart';

enum InterestEditorMode { closed, create, edit }

final class InterestsFormStore extends ChangeNotifier {
  InterestsFormStore({
    required CreateInterestUseCase createInterest,
    required UpdateInterestUseCase updateInterest,
    required ArchiveInterestUseCase archiveInterest,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _createInterest = createInterest,
       _updateInterest = updateInterest,
       _archiveInterest = archiveInterest,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final CreateInterestUseCase _createInterest;
  final UpdateInterestUseCase _updateInterest;
  final ArchiveInterestUseCase _archiveInterest;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;
  InterestEditorMode mode = InterestEditorMode.closed;
  AsyncViewState<InterestSummary> state =
      const InitialViewState<InterestSummary>();
  InterestId? editingInterestId;
  String name = '';
  String queryText = '';

  WorkspaceScope get scope => _scope;

  bool get isOpen => mode != InterestEditorMode.closed;

  UserActionIntent get saveIntent {
    return UserActionIntent(
      id: switch (mode) {
        InterestEditorMode.create => 'interests.create.save',
        InterestEditorMode.edit => 'interests.update.save',
        InterestEditorMode.closed => 'interests.form.closed',
      },
      disabledReasonCode: _validationFailure()?.code,
      idempotencyKey: '${_scope.workspaceId}:$mode:$name',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    close();
  }

  void beginCreate() {
    mode = InterestEditorMode.create;
    editingInterestId = null;
    name = '';
    queryText = '';
    state = const InitialViewState<InterestSummary>();
    notifyListeners();
  }

  void beginEdit(InterestSummary interest) {
    mode = InterestEditorMode.edit;
    editingInterestId = interest.id;
    name = interest.name.value;
    queryText = interest.query.value;
    state = const InitialViewState<InterestSummary>();
    notifyListeners();
  }

  void close() {
    mode = InterestEditorMode.closed;
    editingInterestId = null;
    name = '';
    queryText = '';
    state = const InitialViewState<InterestSummary>();
    notifyListeners();
  }

  void updateName(String value) {
    name = value;
    notifyListeners();
  }

  void updateQueryText(String value) {
    queryText = value;
    notifyListeners();
  }

  Future<Result<InterestSummary>> save() async {
    final validationFailure = _validationFailure();
    if (validationFailure != null) {
      final result = Result<InterestSummary>.failure(validationFailure);
      state = FailureViewState<InterestSummary>(
        failure: validationFailure,
        canRetry: false,
      );
      notifyListeners();
      return result;
    }

    final generation = _generationGuard.markOperationStarted();
    state = const LoadingViewState<InterestSummary>();
    notifyListeners();

    final result = switch (mode) {
      InterestEditorMode.create => await _createInterest(
        CreateInterestCommand(
          scope: _scope,
          name: _interestName(),
          query: _interestQuery(),
          idempotencyKey: saveIntent.idempotencyKey ?? _fallbackCreateKey(),
        ),
      ),
      InterestEditorMode.edit => await _updateInterest(
        UpdateInterestCommand(
          scope: _scope,
          interestId: editingInterestId!,
          name: _interestName(),
          query: _interestQuery(),
        ),
      ),
      InterestEditorMode.closed => const Result<InterestSummary>.failure(
        ValidationFailure(
          message: 'Open an interest form before saving',
          code: 'interests.form_closed',
        ),
      ),
    };

    if (!_generationGuard.isCurrent(generation)) {
      return const Result.failure(
        StaleOperationFailure(
          message: 'Interest form result was replaced by a newer operation',
          code: 'interests.form_stale',
        ),
      );
    }

    state = result.fold(
      onSuccess: (interest) {
        mode = InterestEditorMode.closed;
        return ReadyViewState<InterestSummary>(interest);
      },
      onFailure: (failure) =>
          FailureViewState<InterestSummary>(failure: failure),
    );
    notifyListeners();
    return result;
  }

  Future<Result<InterestSummary>> archive(InterestSummary interest) async {
    final generation = _generationGuard.markOperationStarted();
    state = const LoadingViewState<InterestSummary>();
    notifyListeners();

    final result = await _archiveInterest(
      ArchiveInterestCommand(scope: _scope, interestId: interest.id),
    );

    if (!_generationGuard.isCurrent(generation)) {
      return const Result.failure(
        StaleOperationFailure(
          message: 'Archive result was replaced by a newer operation',
          code: 'interests.archive_stale',
        ),
      );
    }

    state = result.fold(
      onSuccess: ReadyViewState<InterestSummary>.new,
      onFailure: (failure) =>
          FailureViewState<InterestSummary>(failure: failure),
    );
    notifyListeners();
    return result;
  }

  InterestName _interestName() => InterestName(name);

  InterestQuery _interestQuery() => InterestQuery(queryText);

  String _fallbackCreateKey() {
    return '${_scope.workspaceId}:$mode:${_interestName().normalized}';
  }

  AppFailure? _validationFailure() {
    if (mode == InterestEditorMode.closed) {
      return const ValidationFailure(
        message: 'Open an interest form before saving',
        code: 'interests.form_closed',
      );
    }
    if (!_interestName().isValid) {
      return const ValidationFailure(
        message: 'Interest name must contain at least two characters',
        code: 'interests.name_invalid',
        field: 'name',
      );
    }
    if (!_interestQuery().isValid) {
      return const ValidationFailure(
        message: 'Interest query must contain at least two characters',
        code: 'interests.query_invalid',
        field: 'query',
      );
    }
    if (mode == InterestEditorMode.edit && editingInterestId == null) {
      return const ValidationFailure(
        message: 'Select an interest before editing',
        code: 'interests.id_required',
        field: 'interestId',
      );
    }
    return null;
  }
}
