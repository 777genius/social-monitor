import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../routing/app_router.dart';
import '../routing/feature_catalog.dart';
import 'app_feature_route_builders.dart';
import 'app_frontend_runtime_config.dart';
import 'app_runtime.dart';
import 'app_theme_mode_controller.dart';

final class AppCompositionRoot {
  const AppCompositionRoot._({
    required this.router,
    required this.features,
    required this.routeObserver,
    required this.runtime,
    required this.themeModeController,
  });

  final GoRouter router;
  final List<AppFeatureDescriptor> features;
  final RouteObserver<ModalRoute<dynamic>> routeObserver;
  final AppShellRuntime runtime;
  final AppThemeModeController themeModeController;

  factory AppCompositionRoot.production({
    AppShellRuntime? runtime,
    AppThemeModeController? themeModeController,
    AppFrontendRuntimeConfig? runtimeConfig,
    String initialLocation = AppRoutes.initialFromEnvironment,
  }) {
    return AppCompositionRoot._build(
      runtime:
          runtime ??
          (runtimeConfig ?? AppFrontendRuntimeConfig.fromEnvironment())
              .createRuntimeOrNull() ??
          AppShellRuntime.productionPending(),
      themeModeController: themeModeController,
      useDemoRoutes: false,
      initialLocation: initialLocation,
    );
  }

  factory AppCompositionRoot.demo({
    AppShellRuntime? runtime,
    AppThemeModeController? themeModeController,
    String initialLocation = AppRoutes.dashboard,
  }) {
    return AppCompositionRoot._build(
      runtime: runtime ?? AppShellRuntime.demo(),
      themeModeController: themeModeController,
      useDemoRoutes: true,
      initialLocation: initialLocation,
    );
  }

  factory AppCompositionRoot.bootstrap({
    AppShellRuntime? runtime,
    AppThemeModeController? themeModeController,
  }) {
    return AppCompositionRoot.production(
      runtime: runtime,
      themeModeController: themeModeController,
    );
  }

  factory AppCompositionRoot._build({
    required AppShellRuntime runtime,
    AppThemeModeController? themeModeController,
    required bool useDemoRoutes,
    required String initialLocation,
  }) {
    final resolvedRuntime = runtime;
    final resolvedThemeModeController =
        themeModeController ?? AppThemeModeController();
    final routeObserver = RouteObserver<ModalRoute<dynamic>>();
    final features = <AppFeatureDescriptor>[
      _RouteFeatureDescriptor(
        id: 'auth',
        title: 'Auth',
        description: 'Session, tenant, and workspace access flows.',
        route: FeatureRouteContract(
          id: AppRouteId('auth'),
          path: '/auth',
          requiresWorkspace: false,
        ),
        icon: Icons.verified_user_outlined,
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: authFeatureBuilder(useDemoRoutes: useDemoRoutes),
      ),
      _RouteFeatureDescriptor(
        id: 'topics',
        title: 'Topics',
        description: 'Monitoring intents, queries, and topic coverage.',
        route: FeatureRouteContract(id: AppRouteId('topics'), path: '/topics'),
        icon: Icons.track_changes_outlined,
        status: useDemoRoutes
            ? 'Shell'
            : _runtimeFeatureStatus(resolvedRuntime, 'topics'),
        builder: topicsFeatureBuilder(
          useDemoRoutes: useDemoRoutes,
          runtime: resolvedRuntime,
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'sources',
        title: 'Sources',
        description: 'Source catalog, credentials health, and sync state.',
        route: FeatureRouteContract(
          id: AppRouteId('sources'),
          path: '/sources',
        ),
        icon: Icons.hub_outlined,
        status: useDemoRoutes
            ? 'Shell'
            : _runtimeFeatureStatus(resolvedRuntime, 'sources'),
        builder: sourcesFeatureBuilder(
          useDemoRoutes: useDemoRoutes,
          runtime: resolvedRuntime,
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'feed',
        title: 'Feed',
        description: 'Aggregated provider items, search, and provenance.',
        route: FeatureRouteContract(id: AppRouteId('feed'), path: '/feed'),
        icon: Icons.dynamic_feed_outlined,
        status: useDemoRoutes
            ? 'Shell'
            : _runtimeFeatureStatus(resolvedRuntime, 'feed'),
        builder: feedFeatureBuilder(
          useDemoRoutes: useDemoRoutes,
          runtime: resolvedRuntime,
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'summaries',
        title: 'Summaries',
        description: 'Briefings, digests, and insight review workflows.',
        route: FeatureRouteContract(
          id: AppRouteId('summaries'),
          path: '/summaries',
        ),
        icon: Icons.summarize_outlined,
        status: useDemoRoutes
            ? 'Shell'
            : _runtimeFeatureStatus(resolvedRuntime, 'summaries'),
        builder: summariesFeatureBuilder(
          useDemoRoutes: useDemoRoutes,
          runtime: resolvedRuntime,
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'settings',
        title: 'Settings',
        description: 'Workspace governance, account, and preferences.',
        route: FeatureRouteContract(
          id: AppRouteId('settings'),
          path: '/settings',
        ),
        icon: Icons.tune_outlined,
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: settingsFeatureBuilder(
          useDemoRoutes: useDemoRoutes,
          themeModeController: resolvedThemeModeController,
        ),
      ),
    ];

    return AppCompositionRoot._(
      features: features,
      routeObserver: routeObserver,
      runtime: resolvedRuntime,
      themeModeController: resolvedThemeModeController,
      router: createAppRouter(
        features: features,
        observers: [routeObserver],
        runtime: resolvedRuntime,
        themeModeController: resolvedThemeModeController,
        initialLocation: initialLocation,
      ),
    );
  }
}

String _runtimeFeatureStatus(AppShellRuntime runtime, String featureKey) {
  final capability = runtime.capabilities.capability(featureKey);
  if (runtime.workspace.scope == null) {
    return 'Workspace required';
  }
  if (runtime.generatedApiRuntime == null) {
    return 'API not configured';
  }
  if (capability.isDisabled) {
    return capability.disabledReasonCode ?? 'Disabled';
  }
  return 'API';
}

final class _RouteFeatureDescriptor implements AppFeatureDescriptor {
  const _RouteFeatureDescriptor({
    required this.id,
    required this.title,
    required this.description,
    required this.route,
    required this.icon,
    required this.status,
    required AppRouteWidgetBuilder builder,
  }) : _builder = builder;

  @override
  final String id;

  @override
  final String title;

  @override
  final String description;

  @override
  final FeatureRouteContract route;

  @override
  final IconData icon;

  @override
  final String status;

  final AppRouteWidgetBuilder _builder;

  @override
  Widget buildPage(BuildContext context, Uri uri) => _builder(context, uri);
}
