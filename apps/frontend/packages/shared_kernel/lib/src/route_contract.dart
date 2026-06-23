import 'workspace_scope.dart';

final class AppRouteId {
  const AppRouteId(this.value);

  final String value;

  bool get isValid => RegExp(r'^[a-z][a-z0-9_.-]*$').hasMatch(value);
}

final class RouteQueryContract {
  const RouteQueryContract({
    this.allowedKeys = const {},
    this.requiredKeys = const {},
  });

  final Set<String> allowedKeys;
  final Set<String> requiredKeys;

  bool accepts(Map<String, String> query) {
    return requiredKeys.every(query.containsKey) &&
        query.keys.every(allowedKeys.contains);
  }
}

final class FeatureRouteContract {
  const FeatureRouteContract({
    required this.id,
    required this.path,
    this.requiresWorkspace = true,
    this.query = const RouteQueryContract(),
  });

  final AppRouteId id;
  final String path;
  final bool requiresWorkspace;
  final RouteQueryContract query;

  bool get isValid =>
      id.isValid && path.startsWith('/') && !path.contains('//');
}

final class RouteResolution {
  const RouteResolution({
    required this.contract,
    this.scope,
    this.query = const {},
  });

  final FeatureRouteContract contract;
  final WorkspaceScope? scope;
  final Map<String, String> query;

  bool get isValid =>
      contract.isValid &&
      contract.query.accepts(query) &&
      (!contract.requiresWorkspace || scope?.isValid == true);
}
