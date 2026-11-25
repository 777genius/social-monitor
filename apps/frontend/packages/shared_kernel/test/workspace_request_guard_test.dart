import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('marks old workspace requests stale after scope replacement', () {
    final guard = WorkspaceRequestGuard(
      const WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );
    final generation = guard.markRequestStarted();

    guard.replaceScope(
      const WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-2'),
    );

    expect(guard.staleFailureFor(generation), isA<StaleWorkspaceFailure>());
    expect(guard.staleFailureFor(guard.generation), isNull);
  });
}
