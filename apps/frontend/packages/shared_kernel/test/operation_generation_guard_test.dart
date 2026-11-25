import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('marks earlier operations stale after a newer operation starts', () {
    final guard = OperationGenerationGuard();
    final first = guard.markOperationStarted();
    final second = guard.markOperationStarted();

    expect(guard.staleFailureFor(first), isA<StaleOperationFailure>());
    expect(guard.staleFailureFor(second), isNull);
  });

  test('invalidation makes in-flight operations stale', () {
    final guard = OperationGenerationGuard();
    final generation = guard.markOperationStarted();

    guard.invalidate();

    expect(guard.isCurrent(generation), isFalse);
    expect(guard.staleFailureFor(generation), isA<StaleOperationFailure>());
  });
}
