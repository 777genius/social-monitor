import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import 'app_runtime.dart';

final class AppFrontendRuntimeConfig {
  const AppFrontendRuntimeConfig({
    required this.apiBaseUrl,
    required this.correlationId,
    this.tenantId,
    this.workspaceId,
    this.tenantName,
    this.workspaceName,
    this.workspaceRole,
    this.userId,
    this.userLabel,
    this.bearerToken,
  });

  factory AppFrontendRuntimeConfig.fromEnvironment() {
    return const AppFrontendRuntimeConfig(
      apiBaseUrl: String.fromEnvironment('SOCIAL_MONITOR_API_BASE_URL'),
      correlationId: String.fromEnvironment(
        'SOCIAL_MONITOR_CORRELATION_ID',
        defaultValue: 'frontend-generated-api-session',
      ),
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
        defaultValue: 'owner',
      ),
      userId: String.fromEnvironment(
        'SOCIAL_MONITOR_USER_ID',
        defaultValue: 'frontend-runtime-user',
      ),
      userLabel: String.fromEnvironment(
        'SOCIAL_MONITOR_USER_LABEL',
        defaultValue: 'MVP Operator',
      ),
      bearerToken: String.fromEnvironment('SOCIAL_MONITOR_API_BEARER_TOKEN'),
    );
  }

  final String apiBaseUrl;
  final String correlationId;
  final String? tenantId;
  final String? workspaceId;
  final String? tenantName;
  final String? workspaceName;
  final String? workspaceRole;
  final String? userId;
  final String? userLabel;
  final String? bearerToken;

  bool get isConfigured {
    return apiBaseUrl.trim().isNotEmpty &&
        ((bearerToken?.trim().isNotEmpty ?? false) ||
            _workspaceScopeOrNull() != null);
  }

  AppShellRuntime? createRuntimeOrNull() {
    if (!isConfigured) {
      return null;
    }

    final runtime = createGeneratedApiRuntime(
      GeneratedApiConfiguration(
        baseUrl: apiBaseUrl.trim(),
        authorizationProvider: _authorizationHeader,
        workspaceRoleProvider: _workspaceRoleHeader,
        correlationIdProvider: () => correlationId.trim(),
      ),
    );

    final scope = _workspaceScopeOrNull();
    if (scope != null) {
      return AppShellRuntime.connected(
        generatedApiRuntime: runtime,
        workspace: AppWorkspaceSnapshot(
          tenantName: _labelOrDefault(tenantName, 'Current tenant'),
          workspaceName: _labelOrDefault(workspaceName, 'Current workspace'),
          workspaceRole: _labelOrDefault(workspaceRole, 'owner'),
          statusLabel: 'Active',
          scope: scope,
        ),
        session: AppSessionSnapshot(
          isSignedIn: true,
          isRestoring: false,
          userId: _labelOrDefault(userId, 'frontend-runtime-user'),
          userLabel: _labelOrDefault(userLabel, 'MVP Operator'),
          userRole: _userRoleForWorkspaceRole(workspaceRole),
        ),
        correlationId: correlationId.trim(),
      );
    }

    return AppShellRuntime.restoring(
      generatedApiRuntime: runtime,
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

  String? _workspaceRoleHeader() {
    final value = workspaceRole?.trim();
    if (value == null || value.isEmpty) {
      return null;
    }
    return value.toLowerCase();
  }

  String _userRoleForWorkspaceRole(String? value) {
    final normalized = value?.trim().toLowerCase();
    return normalized == 'owner' || normalized == 'admin' ? 'admin' : 'user';
  }

  WorkspaceScope? _workspaceScopeOrNull() {
    final normalizedTenantId = tenantId?.trim();
    final normalizedWorkspaceId = workspaceId?.trim();
    if (normalizedTenantId == null ||
        normalizedTenantId.isEmpty ||
        normalizedWorkspaceId == null ||
        normalizedWorkspaceId.isEmpty) {
      return null;
    }
    return WorkspaceScope(
      tenantId: normalizedTenantId,
      workspaceId: normalizedWorkspaceId,
    );
  }

  String _labelOrDefault(String? value, String fallback) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? fallback : normalized;
  }
}
