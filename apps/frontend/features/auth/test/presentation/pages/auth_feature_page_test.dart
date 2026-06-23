import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_auth/src/application/contracts/session_gateway.dart';
import 'package:social_monitor_auth/src/application/use_cases/restore_session_use_case.dart';
import 'package:social_monitor_auth/src/application/use_cases/select_workspace_use_case.dart';
import 'package:social_monitor_auth/src/domain/entities/auth_session.dart';
import 'package:social_monitor_auth/src/presentation/pages/auth_feature_page.dart';
import 'package:social_monitor_auth/src/presentation/stores/auth_bootstrap_store.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/auth_test_fixtures.dart';

void main() {
  testWidgets('renders restored session state', (tester) async {
    final store = _storeWithResult(Result.success(authSession()));

    await tester.pumpWidget(_TestApp(store: store));
    await tester.pumpAndSettle();

    expect(find.text('Session restored'), findsOneWidget);
    expect(find.textContaining('Acme alerts'), findsOneWidget);
  });

  testWidgets('renders workspace selection state', (tester) async {
    final store = _storeWithResult(
      Result.success(authSessionWithoutWorkspace()),
    );

    await tester.pumpWidget(_TestApp(store: store));
    await tester.pumpAndSettle();

    expect(find.text('Workspace required'), findsOneWidget);
    expect(find.text('Launch lab'), findsOneWidget);
  });
}

AuthBootstrapStore _storeWithResult(Result<AuthSession> result) {
  final gateway = _StaticSessionGateway(result);
  return AuthBootstrapStore(
    restoreSession: RestoreSessionUseCase(gateway),
    selectWorkspace: SelectWorkspaceUseCase(gateway),
  );
}

final class _StaticSessionGateway implements SessionGateway {
  const _StaticSessionGateway(this._result);

  final Result<AuthSession> _result;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    return _result;
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    return _result;
  }
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.store});

  final AuthBootstrapStore store;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: AuthFeaturePage(store: store),
      ),
    );
  }
}
