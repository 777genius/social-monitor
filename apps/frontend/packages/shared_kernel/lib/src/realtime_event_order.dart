import 'workspace_scope.dart';

enum RealtimeApplyDecision {
  apply,
  duplicate,
  stale,
  wrongWorkspace,
  resyncRequired,
}

final class RealtimeCursor {
  const RealtimeCursor(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;
}

final class RealtimeEventEnvelope<T extends Object> {
  const RealtimeEventEnvelope({
    required this.streamId,
    required this.eventId,
    required this.schemaVersion,
    required this.sequence,
    required this.cursor,
    required this.scope,
    required this.payload,
  });

  final String streamId;
  final String eventId;
  final int schemaVersion;
  final int sequence;
  final RealtimeCursor cursor;
  final WorkspaceScope scope;
  final T payload;
}

final class RealtimeEventOrderGuard {
  RealtimeEventOrderGuard({required WorkspaceScope scope}) : _scope = scope;

  WorkspaceScope _scope;
  final Map<String, int> _lastSequenceByStream = {};
  final Set<String> _eventIds = {};

  WorkspaceScope get scope => _scope;

  void replaceScope(WorkspaceScope nextScope) {
    if (_scope == nextScope) {
      return;
    }
    _scope = nextScope;
    _lastSequenceByStream.clear();
    _eventIds.clear();
  }

  RealtimeApplyDecision decisionFor<T extends Object>(
    RealtimeEventEnvelope<T> envelope,
  ) {
    if (envelope.scope != _scope) {
      return RealtimeApplyDecision.wrongWorkspace;
    }
    if (_eventIds.contains(envelope.eventId)) {
      return RealtimeApplyDecision.duplicate;
    }

    final lastSequence = _lastSequenceByStream[envelope.streamId];
    if (lastSequence == null) {
      return RealtimeApplyDecision.apply;
    }
    if (envelope.sequence <= lastSequence) {
      return RealtimeApplyDecision.stale;
    }
    if (envelope.sequence > lastSequence + 1) {
      return RealtimeApplyDecision.resyncRequired;
    }
    return RealtimeApplyDecision.apply;
  }

  void markApplied<T extends Object>(RealtimeEventEnvelope<T> envelope) {
    _eventIds.add(envelope.eventId);
    _lastSequenceByStream[envelope.streamId] = envelope.sequence;
  }
}
