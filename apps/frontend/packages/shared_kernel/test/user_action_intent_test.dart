import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('tracks disabled risky actions without UI copy', () {
    const intent = UserActionIntent(
      id: 'source.rotate_credential',
      risk: UserActionRisk.credential,
      disabledReasonCode: 'missing_permission',
      requiresConfirmation: true,
      idempotencyKey: 'workspace-1:credential-1:rotate',
    );

    expect(intent.isEnabled, isFalse);
    expect(intent.isRisky, isTrue);
    expect(intent.requiresConfirmation, isTrue);
    expect(intent.idempotencyKey, isNotNull);
  });
}
