import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/set_scan_policy_command.dart';
import '../../application/queries/load_scan_policy_query.dart';
import '../../application/use_cases/load_scan_policy_use_case.dart';
import '../../application/use_cases/set_scan_policy_use_case.dart';
import '../../domain/entities/scan_policy.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../view_models/scan_policy_form_draft.dart';

final class ScanPolicyStore extends ChangeNotifier {
  ScanPolicyStore({
    required LoadScanPolicyUseCase loadScanPolicy,
    required SetScanPolicyUseCase setScanPolicy,
    required WorkspaceScope scope,
    OperationGenerationGuard? guard,
  }) : _loadScanPolicy = loadScanPolicy,
       _setScanPolicy = setScanPolicy,
       _scope = scope,
       _guard = guard ?? OperationGenerationGuard();

  final LoadScanPolicyUseCase _loadScanPolicy;
  final SetScanPolicyUseCase _setScanPolicy;
  final OperationGenerationGuard _guard;
  final ScanPolicyFormDraft _draft = ScanPolicyFormDraft();

  WorkspaceScope _scope;
  SourceBindingId? _sourceBindingId;
  int _mutationCounter = 0;

  AsyncViewState<ScanPolicy> policyState = const InitialViewState<ScanPolicy>();
  AsyncViewState<ScanPolicy> saveState = const InitialViewState<ScanPolicy>();

  String get intervalSeconds => _draft.intervalSeconds;

  String get freshnessSeconds => _draft.freshnessSeconds;

  String get retryBudget => _draft.retryBudget;

  SourceBindingId? get sourceBindingId => _sourceBindingId;

  bool get isSaving => saveState is LoadingViewState<ScanPolicy>;

  ValidationFailure? get validationFailure => _draft.validate();

  UserActionIntent get saveIntent {
    final bindingId = _sourceBindingId;
    final failure = _draft.validate();
    return UserActionIntent(
      id: 'scan_policy.save',
      idempotencyKey: bindingId == null
          ? null
          : '${_scope.workspaceId}:${bindingId.value}:scan-policy',
      disabledReasonCode: bindingId == null
          ? 'scan_policy.binding_required'
          : failure?.code,
    );
  }

  void updateScope(WorkspaceScope scope) {
    if (_scope == scope) {
      return;
    }
    _scope = scope;
    _sourceBindingId = null;
    _guard.invalidate();
    policyState = const InitialViewState<ScanPolicy>();
    saveState = const InitialViewState<ScanPolicy>();
    notifyListeners();
  }

  Future<void> loadFor(SourceBindingId sourceBindingId) async {
    if (_sourceBindingId == sourceBindingId &&
        policyState is ReadyViewState<ScanPolicy>) {
      return;
    }
    _sourceBindingId = sourceBindingId;
    saveState = const InitialViewState<ScanPolicy>();
    final generation = _guard.markOperationStarted();
    final previous = switch (policyState) {
      ReadyViewState<ScanPolicy>(:final value) => value,
      _ => null,
    };
    policyState = LoadingViewState<ScanPolicy>(previousValue: previous);
    notifyListeners();

    final result = await _loadScanPolicy(
      LoadScanPolicyQuery(scope: _scope, sourceBindingId: sourceBindingId),
    );
    if (!_guard.isCurrent(generation)) {
      return;
    }
    policyState = result.fold(
      onSuccess: (policy) {
        _draft.updateFromPolicy(policy);
        return ReadyViewState<ScanPolicy>(policy);
      },
      onFailure: (failure) =>
          FailureViewState<ScanPolicy>(failure: failure, canRetry: true),
    );
    notifyListeners();
  }

  Future<void> retry() async {
    final bindingId = _sourceBindingId;
    if (bindingId == null) {
      return;
    }
    await loadFor(bindingId);
  }

  void applyPreset(ScanPolicyPreset preset) {
    _draft.applyPreset(preset);
    notifyListeners();
  }

  void updateIntervalSeconds(String value) {
    _draft.intervalSeconds = value;
    notifyListeners();
  }

  void updateFreshnessSeconds(String value) {
    _draft.freshnessSeconds = value;
    notifyListeners();
  }

  void updateRetryBudget(String value) {
    _draft.retryBudget = value;
    notifyListeners();
  }

  Future<void> save() async {
    final sourceBindingId = _sourceBindingId;
    final validation = _draft.validate();
    if (sourceBindingId == null || validation != null) {
      saveState = FailureViewState<ScanPolicy>(
        failure:
            validation ??
            const ValidationFailure(
              message: 'Select a source binding before saving scan policy',
              code: 'scan_policy.binding_required',
            ),
      );
      notifyListeners();
      return;
    }

    _mutationCounter += 1;
    final generation = _guard.markOperationStarted();
    saveState = const LoadingViewState<ScanPolicy>();
    notifyListeners();

    final result = await _setScanPolicy(
      SetScanPolicyCommand(
        scope: _scope,
        sourceBindingId: sourceBindingId,
        intervalSeconds: _draft.intervalSecondsValue,
        freshnessSeconds: _draft.freshnessSecondsValue,
        retryBudget: _draft.retryBudgetValue,
        idempotencyKey:
            '${_scope.workspaceId}:${sourceBindingId.value}:scan-policy:$_mutationCounter',
      ),
    );
    if (!_guard.isCurrent(generation)) {
      return;
    }
    saveState = result.fold(
      onSuccess: (policy) {
        _draft.updateFromPolicy(policy);
        policyState = ReadyViewState<ScanPolicy>(policy);
        return ReadyViewState<ScanPolicy>(policy);
      },
      onFailure: (failure) => FailureViewState<ScanPolicy>(failure: failure),
    );
    notifyListeners();
  }
}
