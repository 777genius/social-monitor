import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class AppShellRuntime {
  const AppShellRuntime({
    required this.session,
    required this.workspace,
    required this.availableWorkspaces,
    required this.capabilities,
    required this.observability,
    required this.correlationId,
    this.generatedApiRuntime,
  });

  final AppSessionSnapshot session;
  final AppWorkspaceSnapshot workspace;
  final List<AppWorkspaceSnapshot> availableWorkspaces;
  final FeatureFlagSet capabilities;
  final FrontendObservability observability;
  final String correlationId;
  final Object? generatedApiRuntime;

  factory AppShellRuntime.connected({
    required AppWorkspaceSnapshot workspace,
    required Object generatedApiRuntime,
    AppSessionSnapshot session = const AppSessionSnapshot(
      isSignedIn: true,
      isRestoring: false,
      userId: 'frontend-runtime-user',
      userLabel: 'MVP Operator',
      userRole: 'user',
    ),
    FeatureFlagSet capabilities = _enabledRuntimeCapabilities,
    FrontendObservability observability = const NoopFrontendObservability(),
    String correlationId = 'frontend-generated-api-session',
  }) {
    return AppShellRuntime(
      session: session,
      workspace: workspace,
      availableWorkspaces: workspace.isAvailable
          ? List<AppWorkspaceSnapshot>.unmodifiable([workspace])
          : const [],
      capabilities: capabilities,
      observability: observability,
      correlationId: correlationId,
      generatedApiRuntime: generatedApiRuntime,
    );
  }

  factory AppShellRuntime.restoring({
    required Object generatedApiRuntime,
    String correlationId = 'frontend-generated-api-session',
  }) {
    return AppShellRuntime(
      session: const AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: true,
        userId: '',
        userLabel: 'Restoring session',
        userRole: 'user',
      ),
      workspace: const AppWorkspaceSnapshot.missing(),
      availableWorkspaces: const [],
      capabilities: _disabledRuntimeCapabilities('session_restoring'),
      observability: const NoopFrontendObservability(),
      correlationId: correlationId,
      generatedApiRuntime: generatedApiRuntime,
    );
  }

  factory AppShellRuntime.productionPending() {
    return const AppShellRuntime(
      session: AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: false,
        userId: '',
        userLabel: 'Runtime not configured',
        userRole: 'user',
      ),
      workspace: AppWorkspaceSnapshot.missing(),
      availableWorkspaces: [],
      capabilities: FeatureFlagSet({
        'interests': FeatureCapability(
          key: 'interests',
          isEnabled: false,
          disabledReasonCode: 'backend_contract_missing',
        ),
        'sources': FeatureCapability(
          key: 'sources',
          isEnabled: false,
          disabledReasonCode: 'backend_contract_missing',
        ),
        'feed': FeatureCapability(
          key: 'feed',
          isEnabled: false,
          disabledReasonCode: 'backend_contract_missing',
        ),
        'summaries': FeatureCapability(
          key: 'summaries',
          isEnabled: false,
          disabledReasonCode: 'backend_contract_missing',
        ),
        'settings': FeatureCapability(
          key: 'settings',
          isEnabled: false,
          disabledReasonCode: 'backend_contract_missing',
        ),
      }),
      observability: NoopFrontendObservability(),
      correlationId: 'frontend-runtime-not-configured',
    );
  }

  factory AppShellRuntime.demo() {
    return const AppShellRuntime(
      session: AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: false,
        userId: 'user-demo',
        userLabel: 'MVP Operator',
        userRole: 'admin',
      ),
      workspace: AppWorkspaceSnapshot(
        tenantName: 'Acme',
        workspaceName: 'Acme alerts',
        statusLabel: 'Active',
        workspaceRole: 'Owner',
        scope: WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'ws-demo'),
      ),
      availableWorkspaces: [
        AppWorkspaceSnapshot(
          tenantName: 'Acme',
          workspaceName: 'Acme alerts',
          statusLabel: 'Active',
          workspaceRole: 'Owner',
          scope: WorkspaceScope(
            tenantId: 'tenant-demo',
            workspaceId: 'ws-demo',
          ),
        ),
      ],
      capabilities: FeatureFlagSet({
        'interests': FeatureCapability(key: 'interests', isEnabled: true),
        'sources': FeatureCapability(key: 'sources', isEnabled: true),
        'feed': FeatureCapability(key: 'feed', isEnabled: true),
        'summaries': FeatureCapability(key: 'summaries', isEnabled: true),
        'settings': FeatureCapability(key: 'settings', isEnabled: true),
      }),
      observability: NoopFrontendObservability(),
      correlationId: 'frontend-demo-session',
    );
  }

  factory AppShellRuntime.signedOut() {
    return const AppShellRuntime(
      session: AppSessionSnapshot(
        isSignedIn: false,
        isRestoring: false,
        userId: '',
        userLabel: 'Signed out',
        userRole: 'user',
      ),
      workspace: AppWorkspaceSnapshot.missing(),
      availableWorkspaces: [],
      capabilities: FeatureFlagSet({}),
      observability: NoopFrontendObservability(),
      correlationId: 'frontend-signed-out',
    );
  }

  FrontendTraceContext traceForScreen(String screenId) {
    return FrontendTraceContext(
      correlationId: correlationId,
      screenId: screenId,
    );
  }

  AppShellRuntime copyWith({
    AppSessionSnapshot? session,
    AppWorkspaceSnapshot? workspace,
    List<AppWorkspaceSnapshot>? availableWorkspaces,
    FeatureFlagSet? capabilities,
    FrontendObservability? observability,
    String? correlationId,
    Object? generatedApiRuntime,
  }) {
    return AppShellRuntime(
      session: session ?? this.session,
      workspace: workspace ?? this.workspace,
      availableWorkspaces: availableWorkspaces ?? this.availableWorkspaces,
      capabilities: capabilities ?? this.capabilities,
      observability: observability ?? this.observability,
      correlationId: correlationId ?? this.correlationId,
      generatedApiRuntime: generatedApiRuntime ?? this.generatedApiRuntime,
    );
  }
}

final class AppRuntimeController extends ChangeNotifier {
  AppRuntimeController(AppShellRuntime runtime) : _runtime = runtime;

  AppShellRuntime _runtime;

  AppShellRuntime get runtime => _runtime;

  void restoreAuthSession({
    required String userId,
    required String userLabel,
    required String userRole,
    required AppWorkspaceSnapshot selectedWorkspace,
    required List<AppWorkspaceSnapshot> availableWorkspaces,
  }) {
    _runtime = _runtime.copyWith(
      session: AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: false,
        userId: userId,
        userLabel: userLabel,
        userRole: userRole,
      ),
      workspace: selectedWorkspace,
      availableWorkspaces: List<AppWorkspaceSnapshot>.unmodifiable(
        availableWorkspaces,
      ),
      capabilities: _enabledRuntimeCapabilities,
    );
    notifyListeners();
  }

  void selectWorkspace(WorkspaceScope scope) {
    for (final workspace in _runtime.availableWorkspaces) {
      if (workspace.scope == scope) {
        _runtime = _runtime.copyWith(workspace: workspace);
        notifyListeners();
        return;
      }
    }
  }
}

final class AppSessionSnapshot {
  const AppSessionSnapshot({
    required this.isSignedIn,
    required this.isRestoring,
    required this.userId,
    required this.userLabel,
    required this.userRole,
  });

  final bool isSignedIn;
  final bool isRestoring;
  final String userId;
  final String userLabel;
  final String userRole;
}

final class AppWorkspaceSnapshot {
  const AppWorkspaceSnapshot({
    required this.tenantName,
    required this.workspaceName,
    required this.statusLabel,
    required this.workspaceRole,
    required this.scope,
  });

  const AppWorkspaceSnapshot.missing()
    : tenantName = 'No tenant',
      workspaceName = 'Workspace required',
      statusLabel = 'Missing',
      workspaceRole = 'Unknown',
      scope = null;

  final String tenantName;
  final String workspaceName;
  final String statusLabel;
  final String workspaceRole;
  final WorkspaceScope? scope;

  bool get isAvailable => scope != null;
}

const _enabledRuntimeCapabilities = FeatureFlagSet({
  'interests': FeatureCapability(key: 'interests', isEnabled: true),
  'sources': FeatureCapability(key: 'sources', isEnabled: true),
  'feed': FeatureCapability(key: 'feed', isEnabled: true),
  'summaries': FeatureCapability(key: 'summaries', isEnabled: true),
  'settings': FeatureCapability(key: 'settings', isEnabled: true),
});

FeatureFlagSet _disabledRuntimeCapabilities(String reasonCode) {
  return FeatureFlagSet({
    'interests': FeatureCapability(
      key: 'interests',
      isEnabled: false,
      disabledReasonCode: reasonCode,
    ),
    'sources': FeatureCapability(
      key: 'sources',
      isEnabled: false,
      disabledReasonCode: reasonCode,
    ),
    'feed': FeatureCapability(
      key: 'feed',
      isEnabled: false,
      disabledReasonCode: reasonCode,
    ),
    'summaries': FeatureCapability(
      key: 'summaries',
      isEnabled: false,
      disabledReasonCode: reasonCode,
    ),
    'settings': FeatureCapability(
      key: 'settings',
      isEnabled: false,
      disabledReasonCode: reasonCode,
    ),
  });
}
