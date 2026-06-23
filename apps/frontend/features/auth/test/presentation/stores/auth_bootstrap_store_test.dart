import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_auth/src/application/contracts/session_gateway.dart';
import 'package:social_monitor_auth/src/application/use_cases/restore_session_use_case.dart';
import 'package:social_monitor_auth/src/application/use_cases/select_workspace_use_case.dart';
import 'package:social_monitor_auth/src/domain/entities/auth_session.dart';
import 'package:social_monitor_auth/src/presentation/stores/auth_bootstrap_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/auth_test_fixtures.dart';

void main() {
  test('restores ready session state', () async {
    final store = _storeWithGateway(
      _QueuedSessionGateway([Result.success(authSession())]),
    );

    await store.restoreSession();

    expect(store.state, isA<ReadyViewState<AuthSession>>());
  });

  test(
    'requires workspace when restored session has no selected workspace',
    () async {
      final store = _storeWithGateway(
        _QueuedSessionGateway([Result.success(authSessionWithoutWorkspace())]),
      );

      await store.restoreSession();

      expect(store.state, isA<PermissionRequiredViewState<AuthSession>>());
      expect(store.session?.workspaces.length, 2);
    },
  );

  test('rejects stale restore result after workspace selection', () async {
    final gateway = _CompleterSessionGateway();
    final store = _storeWithGateway(gateway);

    final restore = store.restoreSession();
    await Future<void>.delayed(Duration.zero);
    final select = store.selectWorkspace(secondaryWorkspaceScope);
    await Future<void>.delayed(Duration.zero);

    gateway.completeAt(
      1,
      Result.success(authSession(selectedWorkspace: secondaryWorkspace)),
    );
    await select;

    gateway.completeAt(
      0,
      Result.success(authSession(selectedWorkspace: primaryWorkspace)),
    );
    await restore;

    final state = store.state as ReadyViewState<AuthSession>;
    expect(state.value.selectedWorkspace?.workspaceName, 'Launch lab');
  });

  test('resumes only safe pending intent after session restore', () {
    final store = _storeWithGateway(
      _QueuedSessionGateway([Result.success(authSession())]),
    );
    const safeIntent = UserActionIntent(id: 'feed.open');
    const riskyIntent = UserActionIntent(
      id: 'sources.reconnect',
      risk: UserActionRisk.credential,
      requiresConfirmation: true,
    );

    store.rememberPendingIntent(riskyIntent);
    expect(store.takeSafePendingIntent(), isNull);

    store.rememberPendingIntent(safeIntent);
    expect(store.takeSafePendingIntent()?.id, 'feed.open');
    expect(store.pendingIntent, isNull);
  });
}

AuthBootstrapStore _storeWithGateway(SessionGateway gateway) {
  return AuthBootstrapStore(
    restoreSession: RestoreSessionUseCase(gateway),
    selectWorkspace: SelectWorkspaceUseCase(gateway),
  );
}

final class _QueuedSessionGateway implements SessionGateway {
  _QueuedSessionGateway(this._results);

  final List<Result<AuthSession>> _results;
  var _index = 0;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    final result = _results[_index];
    _index += 1;
    return result;
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    final result = _results[_index];
    _index += 1;
    return result;
  }
}

final class _CompleterSessionGateway implements SessionGateway {
  final _completers = <Completer<Result<AuthSession>>>[];

  @override
  Future<Result<AuthSession>> restoreSession() {
    final completer = Completer<Result<AuthSession>>();
    _completers.add(completer);
    return completer.future;
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) {
    final completer = Completer<Result<AuthSession>>();
    _completers.add(completer);
    return completer.future;
  }

  void completeAt(int index, Result<AuthSession> result) {
    _completers[index].complete(result);
  }
}
