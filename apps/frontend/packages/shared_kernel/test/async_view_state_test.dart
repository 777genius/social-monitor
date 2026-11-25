import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('ready state records partial stale offline and degraded flags', () {
    const state = ReadyViewState<String>(
      'items',
      isPartial: true,
      isStale: true,
      isOffline: true,
      isDegraded: true,
    );

    expect(state.hasValue, isTrue);
    expect(state.isLoading, isFalse);
    expect(state.isPartial, isTrue);
    expect(state.isStale, isTrue);
    expect(state.isOffline, isTrue);
    expect(state.isDegraded, isTrue);
  });

  test('failure state carries typed failure and retry policy', () {
    const state = FailureViewState<String>(
      failure: NetworkFailure(message: 'Offline'),
      canRetry: false,
    );

    expect(state.failure, isA<NetworkFailure>());
    expect(state.canRetry, isFalse);
  });
}
