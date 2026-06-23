import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/request_scan_command.dart';
import '../../application/queries/load_scan_status_query.dart';
import '../../application/use_cases/load_scan_status_use_case.dart';
import '../../application/use_cases/request_scan_use_case.dart';
import '../../domain/entities/scan_request.dart';
import '../../domain/entities/scan_status_snapshot.dart';
import '../../domain/value_objects/scan_job_id.dart';
import '../../domain/value_objects/source_binding_id.dart';

final class ScanRunStore extends ChangeNotifier {
  ScanRunStore({
    required RequestScanUseCase requestScan,
    required LoadScanStatusUseCase loadScanStatus,
    required WorkspaceScope scope,
    bool autoPolling = true,
    Duration initialPollDelay = const Duration(seconds: 2),
    Duration maxPollDelay = const Duration(seconds: 30),
    OperationGenerationGuard? guard,
  }) : _requestScan = requestScan,
       _loadScanStatus = loadScanStatus,
       _scope = scope,
       _autoPolling = autoPolling,
       _initialPollDelay = initialPollDelay,
       _maxPollDelay = maxPollDelay,
       _nextPollDelay = initialPollDelay,
       _guard = guard ?? OperationGenerationGuard();

  final RequestScanUseCase _requestScan;
  final LoadScanStatusUseCase _loadScanStatus;
  final bool _autoPolling;
  final Duration _initialPollDelay;
  final Duration _maxPollDelay;
  final OperationGenerationGuard _guard;

  WorkspaceScope _scope;
  SourceBindingId? _sourceBindingId;
  ScanJobId? _activeScanJobId;
  Timer? _pollTimer;
  Duration _nextPollDelay;
  int _mutationCounter = 0;

  AsyncViewState<ScanRequest> requestState =
      const InitialViewState<ScanRequest>();
  AsyncViewState<ScanStatusSnapshot> statusState =
      const InitialViewState<ScanStatusSnapshot>();

  SourceBindingId? get sourceBindingId => _sourceBindingId;

  bool get isRequesting => requestState is LoadingViewState<ScanRequest>;

  UserActionIntent get startScanIntent {
    final bindingId = _sourceBindingId;
    return UserActionIntent(
      id: 'scan_run.start',
      idempotencyKey: bindingId == null
          ? null
          : '${_scope.workspaceId}:${bindingId.value}:scan-run',
      disabledReasonCode: bindingId == null
          ? 'scan_run.binding_required'
          : isRequesting
          ? 'scan_run.request_in_progress'
          : null,
    );
  }

  void updateScope(WorkspaceScope scope) {
    if (_scope == scope) {
      return;
    }
    _scope = scope;
    bindTo(null);
  }

  void bindTo(SourceBindingId? sourceBindingId) {
    if (_sourceBindingId == sourceBindingId) {
      return;
    }
    _sourceBindingId = sourceBindingId;
    _activeScanJobId = null;
    _cancelPolling();
    _guard.invalidate();
    _nextPollDelay = _initialPollDelay;
    requestState = const InitialViewState<ScanRequest>();
    statusState = const InitialViewState<ScanStatusSnapshot>();
    notifyListeners();
  }

  Future<void> requestScan() async {
    final bindingId = _sourceBindingId;
    if (bindingId == null) {
      requestState = const FailureViewState<ScanRequest>(
        failure: ValidationFailure(
          message: 'Select a source binding before starting a scan',
          code: 'scan_run.binding_required',
        ),
      );
      notifyListeners();
      return;
    }

    _mutationCounter += 1;
    _cancelPolling();
    _nextPollDelay = _initialPollDelay;
    final generation = _guard.markOperationStarted();
    requestState = const LoadingViewState<ScanRequest>();
    notifyListeners();

    final result = await _requestScan(
      RequestScanCommand(
        scope: _scope,
        sourceBindingId: bindingId,
        idempotencyKey:
            '${_scope.workspaceId}:${bindingId.value}:scan-run:$_mutationCounter',
      ),
    );
    if (!_guard.isCurrent(generation) || _sourceBindingId != bindingId) {
      return;
    }

    await result.fold(
      onSuccess: (request) async {
        _activeScanJobId = request.scanJobId;
        requestState = ReadyViewState<ScanRequest>(request);
        notifyListeners();
        await loadStatus(request.scanJobId);
      },
      onFailure: (failure) async {
        requestState = FailureViewState<ScanRequest>(failure: failure);
        notifyListeners();
      },
    );
  }

  Future<void> retryStatus() async {
    final scanJobId = _activeScanJobId;
    if (scanJobId == null) {
      return;
    }
    await loadStatus(scanJobId);
  }

  Future<void> loadStatus(ScanJobId scanJobId) async {
    if (_activeScanJobId != null && _activeScanJobId != scanJobId) {
      return;
    }
    _activeScanJobId = scanJobId;
    final generation = _guard.markOperationStarted();
    final previous = switch (statusState) {
      ReadyViewState<ScanStatusSnapshot>(:final value) => value,
      _ => null,
    };
    statusState = LoadingViewState<ScanStatusSnapshot>(previousValue: previous);
    notifyListeners();

    final result = await _loadScanStatus(
      LoadScanStatusQuery(scope: _scope, scanJobId: scanJobId),
    );
    if (!_guard.isCurrent(generation) || _activeScanJobId != scanJobId) {
      return;
    }

    statusState = result.fold(
      onSuccess: (status) {
        _scheduleNextPoll(status);
        return ReadyViewState<ScanStatusSnapshot>(status);
      },
      onFailure: (failure) =>
          FailureViewState<ScanStatusSnapshot>(failure: failure),
    );
    notifyListeners();
  }

  void _scheduleNextPoll(ScanStatusSnapshot status) {
    _cancelPolling();
    if (!_autoPolling || status.isTerminal) {
      return;
    }
    final delay = _nextPollDelay;
    _nextPollDelay = _nextBackoff(delay);
    _pollTimer = Timer(delay, () {
      final scanJobId = _activeScanJobId;
      if (scanJobId == null) {
        return;
      }
      unawaited(loadStatus(scanJobId));
    });
  }

  Duration _nextBackoff(Duration current) {
    final next = current * 2;
    if (next > _maxPollDelay) {
      return _maxPollDelay;
    }
    return next;
  }

  void _cancelPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  @override
  void dispose() {
    _cancelPolling();
    _guard.invalidate();
    super.dispose();
  }
}
