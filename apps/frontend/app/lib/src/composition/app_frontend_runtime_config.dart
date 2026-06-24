import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import 'app_runtime.dart';

final class AppFrontendRuntimeConfig {
  const AppFrontendRuntimeConfig({
    required this.apiBaseUrl,
    required this.tenantId,
    required this.workspaceId,
    required this.tenantName,
    required this.workspaceName,
    required this.workspaceRole,
    required this.userId,
    required this.userLabel,
    required this.correlationId,
    this.bearerToken,
  });

  factory AppFrontendRuntimeConfig.fromEnvironment() {
    return const AppFrontendRuntimeConfig(
      apiBaseUrl: String.fromEnvironment('SOCIAL_MONITOR_API_BASE_URL'),
      tenantId: String.fromEnvironment('SOCIAL_MONITOR_TENANT_ID'),
      workspaceId: String.fromEnvironment('SOCIAL_MONITOR_WORKSPACE_ID'),
      tenantName: String.fromEnvironment(
        'SOCIAL_MONITOR_TENANT_NAME',
        defaultValue: 'Current tenant',
      ),
      workspaceName: String.fromEnvironment(
        'SOCIAL_MONITOR_WORKSPACE_NAME',
        defaultValue: 'Current workspace',
      ),
      workspaceRole: String.fromEnvironment(
        'SOCIAL_MONITOR_WORKSPACE_ROLE',
        defaultValue: 'admin',
      ),
      userId: String.fromEnvironment('SOCIAL_MONITOR_USER_ID'),
      userLabel: String.fromEnvironment(
        'SOCIAL_MONITOR_USER_LABEL',
        defaultValue: 'MVP Operator',
      ),
      correlationId: String.fromEnvironment(
        'SOCIAL_MONITOR_CORRELATION_ID',
        defaultValue: 'frontend-generated-api-session',
      ),
      bearerToken: String.fromEnvironment('SOCIAL_MONITOR_API_BEARER_TOKEN'),
    );
  }

  final String apiBaseUrl;
  final String tenantId;
  final String workspaceId;
  final String tenantName;
  final String workspaceName;
  final String workspaceRole;
  final String userId;
  final String userLabel;
  final String correlationId;
  final String? bearerToken;

  bool get isConfigured {
    return apiBaseUrl.trim().isNotEmpty &&
        tenantId.trim().isNotEmpty &&
        workspaceId.trim().isNotEmpty &&
        workspaceRole.trim().isNotEmpty &&
        userId.trim().isNotEmpty;
  }

  AppShellRuntime? createRuntimeOrNull() {
    if (!isConfigured) {
      return null;
    }

    final runtime = createGeneratedApiRuntime(
      GeneratedApiConfiguration(
        baseUrl: apiBaseUrl.trim(),
        authorizationProvider: _authorizationHeader,
        workspaceRoleProvider: () => workspaceRole.trim(),
        correlationIdProvider: () => correlationId.trim(),
      ),
    );

    return AppShellRuntime.connected(
      workspace: AppWorkspaceSnapshot(
        tenantName: tenantName.trim(),
        workspaceName: workspaceName.trim(),
        statusLabel: 'Active',
        scope: WorkspaceScope(
          tenantId: tenantId.trim(),
          workspaceId: workspaceId.trim(),
        ),
      ),
      generatedApiRuntime: runtime,
      session: AppSessionSnapshot(
        isSignedIn: true,
        isRestoring: false,
        userId: userId.trim(),
        userLabel: userLabel.trim(),
      ),
      capabilities: const FeatureFlagSet({
        'topics': FeatureCapability(key: 'topics', isEnabled: true),
        'sources': FeatureCapability(key: 'sources', isEnabled: true),
        'feed': FeatureCapability(key: 'feed', isEnabled: true),
        'summaries': FeatureCapability(key: 'summaries', isEnabled: true),
        'settings': FeatureCapability(
          key: 'settings',
          isEnabled: false,
          disabledReasonCode: 'frontend_slice_pending',
        ),
      }),
      correlationId: correlationId.trim(),
    );
  }

  String? _authorizationHeader() {
    final token = bearerToken?.trim();
    if (token == null || token.isEmpty) {
      return null;
    }
    if (token.toLowerCase().startsWith('bearer ')) {
      return token;
    }
    return 'Bearer $token';
  }
}
