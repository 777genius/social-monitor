import 'app_failure.dart';

sealed class AsyncViewState<T extends Object> {
  const AsyncViewState();

  bool get hasValue => this is ReadyViewState<T>;

  bool get isLoading => this is LoadingViewState<T>;
}

final class InitialViewState<T extends Object> extends AsyncViewState<T> {
  const InitialViewState();
}

final class LoadingViewState<T extends Object> extends AsyncViewState<T> {
  const LoadingViewState({this.previousValue});

  final T? previousValue;
}

final class EmptyViewState<T extends Object> extends AsyncViewState<T> {
  const EmptyViewState({required this.reason});

  final String reason;
}

final class ReadyViewState<T extends Object> extends AsyncViewState<T> {
  const ReadyViewState(
    this.value, {
    this.isPartial = false,
    this.isStale = false,
    this.isOffline = false,
    this.isDegraded = false,
  });

  final T value;
  final bool isPartial;
  final bool isStale;
  final bool isOffline;
  final bool isDegraded;
}

final class PermissionRequiredViewState<T extends Object>
    extends AsyncViewState<T> {
  const PermissionRequiredViewState({
    required this.permissionKey,
    required this.message,
  });

  final String permissionKey;
  final String message;
}

final class RetryingViewState<T extends Object> extends AsyncViewState<T> {
  const RetryingViewState({this.previousValue});

  final T? previousValue;
}

final class FailureViewState<T extends Object> extends AsyncViewState<T> {
  const FailureViewState({required this.failure, this.canRetry = true});

  final AppFailure failure;
  final bool canRetry;
}
