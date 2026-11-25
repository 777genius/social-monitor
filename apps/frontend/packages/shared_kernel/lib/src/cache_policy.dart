import 'workspace_scope.dart';

enum FrontendCacheFreshness { fresh, stale, expired }

final class FrontendCachePolicy {
  const FrontendCachePolicy({
    required this.freshFor,
    required this.staleFor,
    this.allowPersistence = false,
  });

  final Duration freshFor;
  final Duration staleFor;
  final bool allowPersistence;

  bool get isInMemoryOnly => !allowPersistence;
}

final class FrontendCacheEntry<T extends Object> {
  const FrontendCacheEntry({
    required this.value,
    required this.scope,
    required this.storedAt,
    required this.policy,
  });

  final T value;
  final WorkspaceScope scope;
  final DateTime storedAt;
  final FrontendCachePolicy policy;

  FrontendCacheFreshness freshnessAt(
    DateTime now, {
    required WorkspaceScope currentScope,
  }) {
    if (scope != currentScope) {
      return FrontendCacheFreshness.expired;
    }

    final age = now.difference(storedAt);
    if (age <= policy.freshFor) {
      return FrontendCacheFreshness.fresh;
    }
    if (age <= policy.freshFor + policy.staleFor) {
      return FrontendCacheFreshness.stale;
    }
    return FrontendCacheFreshness.expired;
  }
}
