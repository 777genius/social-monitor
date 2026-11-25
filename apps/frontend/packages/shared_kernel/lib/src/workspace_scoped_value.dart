import 'workspace_scope.dart';

final class WorkspaceScopedValue<T extends Object> {
  const WorkspaceScopedValue({
    required this.scope,
    required this.generation,
    required this.value,
  });

  final WorkspaceScope scope;
  final int generation;
  final T value;

  bool isCurrent({
    required WorkspaceScope currentScope,
    required int currentGeneration,
  }) {
    return scope == currentScope && generation == currentGeneration;
  }
}
