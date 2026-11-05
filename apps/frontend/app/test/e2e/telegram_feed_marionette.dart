import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:marionette_flutter/marionette_flutter.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_app/src/composition/app_feature_route_builders.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

/// Read-only E2E entrypoint. The caller supplies a loopback HTTP fixture/proxy.
void main() {
  if (!kDebugMode) throw StateError('Debug E2E entrypoint only');
  const baseUrl = String.fromEnvironment('TELEGRAM_FEED_E2E_BASE_URL');
  final uri = Uri.parse(baseUrl);
  if (uri.scheme != 'http' ||
      !const {'127.0.0.1', 'localhost'}.contains(uri.host)) {
    throw StateError('An explicit loopback E2E API URL is required');
  }
  MarionetteBinding.ensureInitialized();
  final runtime = createGeneratedApiRuntime(
    GeneratedApiConfiguration(
      baseUrl: baseUrl,
      workspaceRoleProvider: () => 'viewer',
    ),
  );
  final controller = AppRuntimeController(
    AppShellRuntime.connected(
      workspace: const AppWorkspaceSnapshot(
        tenantName: 'E2E',
        workspaceName: 'E2E',
        workspaceRole: 'viewer',
        statusLabel: 'Active',
        scope: WorkspaceScope(
          tenantId: '00000000-0000-7000-8000-000000006101',
          workspaceId: '00000000-0000-7000-8000-000000006102',
        ),
      ),
      generatedApiRuntime: runtime,
      capabilities: const FeatureFlagSet({
        'feed': FeatureCapability(key: 'feed', isEnabled: true),
      }),
    ),
  );
  final builder = feedFeatureBuilder(
    useDemoRoutes: false,
    runtimeController: controller,
  );
  final theme = AppTheme.light();
  final observer = RouteObserver<ModalRoute<dynamic>>();
  runApp(
    ModularityRoot(
      observer: observer,
      child: AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          navigatorObservers: [observer],
          home: Scaffold(
            body: Builder(builder: (context) => builder(context, Uri())),
          ),
        ),
      ),
    ),
  );
}
