import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class AppShellRuntime {
  const AppShellRuntime({
    required this.session,
    required this.workspace,
    required this.capabilities,
    required this.observability,
    required this.correlationId,
    this.generatedApiRuntime,
  });

  final AppSessionSnapshot session;
  final AppWorkspaceSnapshot workspace;
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
      userLabel: 'MVP Operator',
    ),
    FeatureFlagSet capabilities = const FeatureFlagSet({
      'topics': FeatureCapability(key: 'topics', isEnabled: true),
      'sources': FeatureCapability(key: 'sources', isEnabled: true),
    }),
    FrontendObservability observability = const NoopFrontendObservability(),
    String correlationId = 'frontend-generated-api-session',
  }) {
    return AppShellRuntime(
      session: session,
      workspace: workspace,
      capabilities: capabilities,
      observability: observability,
      correlationId: correlationId,
      generatedApiRuntime: generatedApiRuntime,
    );
  }

  factory AppShellRuntime.productionPending() {
    return const AppShellRuntime(
      session: AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: false,
        userLabel: 'Runtime not configured',
      ),
      workspace: AppWorkspaceSnapshot.missing(),
      capabilities: FeatureFlagSet({
        'topics': FeatureCapability(
          key: 'topics',
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
        userLabel: 'MVP Operator',
      ),
      workspace: AppWorkspaceSnapshot(
        tenantName: 'Acme',
        workspaceName: 'Acme alerts',
        statusLabel: 'Active',
        scope: WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'ws-demo'),
      ),
      capabilities: FeatureFlagSet({
        'topics': FeatureCapability(key: 'topics', isEnabled: true),
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
        userLabel: 'Signed out',
      ),
      workspace: AppWorkspaceSnapshot.missing(),
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
}

final class AppSessionSnapshot {
  const AppSessionSnapshot({
    required this.isSignedIn,
    required this.isRestoring,
    required this.userLabel,
  });

  final bool isSignedIn;
  final bool isRestoring;
  final String userLabel;
}

final class AppWorkspaceSnapshot {
  const AppWorkspaceSnapshot({
    required this.tenantName,
    required this.workspaceName,
    required this.statusLabel,
    required this.scope,
  });

  const AppWorkspaceSnapshot.missing()
    : tenantName = 'No tenant',
      workspaceName = 'Workspace required',
      statusLabel = 'Missing',
      scope = null;

  final String tenantName;
  final String workspaceName;
  final String statusLabel;
  final WorkspaceScope? scope;

  bool get isAvailable => scope != null;
}
