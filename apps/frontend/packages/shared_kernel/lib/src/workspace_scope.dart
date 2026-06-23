final class WorkspaceScope {
  const WorkspaceScope({required this.tenantId, required this.workspaceId});

  final String tenantId;
  final String workspaceId;

  bool get isValid =>
      tenantId.trim().isNotEmpty && workspaceId.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is WorkspaceScope &&
        other.tenantId == tenantId &&
        other.workspaceId == workspaceId;
  }

  @override
  int get hashCode => Object.hash(tenantId, workspaceId);
}
