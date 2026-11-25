import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_auth/src/application/contracts/session_gateway.dart';
import 'package:social_monitor_auth/src/application/use_cases/restore_session_use_case.dart';
import 'package:social_monitor_auth/src/application/use_cases/select_workspace_use_case.dart';
import 'package:social_monitor_auth/src/domain/entities/auth_session.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/auth_test_fixtures.dart';

void main() {
  test('restores session through Result', () async {
    final useCase = RestoreSessionUseCase(
      _FakeSessionGateway(Result.success(authSession())),
    );

    final result = await useCase();

    expect(result, isA<ResultSuccess<AuthSession>>());
  });

  test('select workspace validates scope before gateway call', () async {
    final gateway = _FakeSessionGateway(Result.success(authSession()));
    final useCase = SelectWorkspaceUseCase(gateway);

    final result = await useCase(
      const WorkspaceScope(tenantId: '', workspaceId: ''),
    );

    expect(result, isA<ResultFailure<AuthSession>>());
    expect(gateway.selectCalls, 0);
  });
}

final class _FakeSessionGateway implements SessionGateway {
  _FakeSessionGateway(this._result);

  final Result<AuthSession> _result;
  int selectCalls = 0;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    return _result;
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    selectCalls += 1;
    return _result;
  }
}
