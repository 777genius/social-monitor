import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import 'app_runtime.dart';
import 'early_app_bootstrap.dart';

typedef EarlyAppBootstrapReader = Future<Map<String, Object?>?> Function();

/// Restores the backend session at app start so every page opens signed-in,
/// without requiring the user to visit the auth route first.
///
/// On failure the runtime stays in its restoring state: the auth page still
/// owns interactive repair (retry, workspace selection, error details).
Future<void> bootstrapAppSession(
  AppRuntimeController controller, {
  EarlyAppBootstrapReader earlyBootstrapReader = takeEarlyAppBootstrap,
}) async {
  final runtime = controller.runtime;
  final apiRuntime = runtime.generatedApiRuntime;
  if (!runtime.session.isRestoring ||
      apiRuntime is! generated.GeneratedApiRuntime) {
    return;
  }

  final bootstrap = await _loadBootstrap(apiRuntime, earlyBootstrapReader);
  if (bootstrap != null) {
    _restoreSession(
      controller,
      bootstrap.session,
      initialSummaryBootstrap: bootstrap.readerSummaries,
    );
    return;
  }

  final sessionResult = await apiRuntime.client
      .sendUnscoped<generated.AuthSessionResponseDto>(
        () => apiRuntime.rest.auth.authSessionControllerGet(),
      );

  sessionResult.fold(
    onSuccess: (dto) => _restoreSession(controller, dto),
    onFailure: (_) {
      // Keep the restoring state; the auth page surfaces the failure and
      // offers an explicit refresh action.
    },
  );
}

Future<generated.AppBootstrapResponseDto?> _loadBootstrap(
  generated.GeneratedApiRuntime apiRuntime,
  EarlyAppBootstrapReader earlyBootstrapReader,
) async {
  Map<String, Object?>? earlyPayload;
  try {
    earlyPayload = await earlyBootstrapReader();
  } on Object {
    // The generated client remains authoritative when the HTML bridge fails.
  }
  if (earlyPayload != null) {
    try {
      final bootstrap = generated.AppBootstrapResponseDto.fromJson(
        earlyPayload,
      );
      if (_hasConsistentBootstrapScope(bootstrap)) {
        return bootstrap;
      }
    } on Object {
      // A stale or malformed HTML-prefetched contract safely falls through.
    }
  }

  final result = await apiRuntime.client
      .sendUnscoped<generated.AppBootstrapResponseDto>(
        () => apiRuntime.rest.appBootstrap.appBootstrapControllerGet(),
      );
  return result.fold(
    onSuccess: (dto) => _hasConsistentBootstrapScope(dto) ? dto : null,
    onFailure: (_) => null,
  );
}

bool _hasConsistentBootstrapScope(generated.AppBootstrapResponseDto dto) {
  final selectedWorkspace = dto.session.selectedWorkspace;
  final summaries = dto.readerSummaries;
  return summaries.tenantId == selectedWorkspace.tenantId &&
      summaries.workspaceId == selectedWorkspace.workspaceId;
}

void _restoreSession(
  AppRuntimeController controller,
  generated.AuthSessionResponseDto dto, {
  generated.ReaderSummaryBootstrapResponseDto? initialSummaryBootstrap,
}) {
  if (!controller.runtime.session.isRestoring) {
    return;
  }
  final selectedWorkspace = _workspaceSnapshot(dto.selectedWorkspace);
  final selectedScope = selectedWorkspace.scope;
  controller.restoreAuthSession(
    userId: dto.userId,
    userLabel: dto.userLabel,
    userRole:
        dto.userRole == generated.AuthSessionResponseDtoUserRoleUserRole.admin
        ? 'admin'
        : 'user',
    selectedWorkspace: selectedWorkspace,
    availableWorkspaces: _ensureSelected([
      for (final workspace in dto.workspaces) _workspaceSnapshot(workspace),
    ], selectedWorkspace),
    initialSummaryBootstrap:
        initialSummaryBootstrap == null || selectedScope == null
        ? null
        : AppInitialSummaryBootstrap(
            scope: selectedScope,
            payload: initialSummaryBootstrap,
          ),
  );
}

AppWorkspaceSnapshot _workspaceSnapshot(generated.AuthSessionWorkspaceDto dto) {
  return AppWorkspaceSnapshot(
    tenantName: dto.tenantName,
    workspaceName: dto.workspaceName,
    statusLabel: dto.statusLabel,
    workspaceRole: _workspaceRole(dto.workspaceRole),
    scope: WorkspaceScope(tenantId: dto.tenantId, workspaceId: dto.workspaceId),
  );
}

String _workspaceRole(
  generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole role,
) {
  return role ==
          generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.$unknown
      ? 'viewer'
      : role.toJson();
}

List<AppWorkspaceSnapshot> _ensureSelected(
  List<AppWorkspaceSnapshot> workspaces,
  AppWorkspaceSnapshot selected,
) {
  for (final workspace in workspaces) {
    if (workspace.scope == selected.scope) {
      return workspaces;
    }
  }
  return [selected, ...workspaces];
}
