import 'cache_policy.dart';
import 'workspace_scope.dart';

final class FrontendMemoryCache<T extends Object> {
  FrontendMemoryCache({required this.policy, DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final FrontendCachePolicy policy;
  final DateTime Function() _now;
  final Map<String, FrontendCacheEntry<T>> _entries = {};

  int get length => _entries.length;

  void put(String key, T value, {required WorkspaceScope scope}) {
    _entries[key] = FrontendCacheEntry<T>(
      value: value,
      scope: scope,
      storedAt: _now(),
      policy: policy,
    );
  }

  FrontendMemoryCacheRead<T> read(String key, {required WorkspaceScope scope}) {
    final entry = _entries[key];
    if (entry == null) {
      return const FrontendMemoryCacheRead.miss();
    }
    final freshness = entry.freshnessAt(_now(), currentScope: scope);
    if (freshness == FrontendCacheFreshness.expired) {
      _entries.remove(key);
      return const FrontendMemoryCacheRead.miss();
    }
    return FrontendMemoryCacheRead.hit(entry.value, freshness: freshness);
  }

  void invalidateWorkspace(WorkspaceScope scope) {
    _entries.removeWhere((key, entry) => entry.scope == scope);
  }

  void clear() {
    _entries.clear();
  }
}

final class FrontendMemoryCacheRead<T extends Object> {
  const FrontendMemoryCacheRead.hit(this.value, {required this.freshness})
    : isHit = true;

  const FrontendMemoryCacheRead.miss()
    : value = null,
      freshness = FrontendCacheFreshness.expired,
      isHit = false;

  final T? value;
  final FrontendCacheFreshness freshness;
  final bool isHit;

  bool get canServe =>
      isHit &&
      (freshness == FrontendCacheFreshness.fresh ||
          freshness == FrontendCacheFreshness.stale);
}
