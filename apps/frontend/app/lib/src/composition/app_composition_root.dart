import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_auth/social_monitor_auth.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_feed/social_monitor_feed.dart';
import 'package:social_monitor_settings/social_monitor_settings.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/social_monitor_sources.dart';
import 'package:social_monitor_summaries/social_monitor_summaries.dart';
import 'package:social_monitor_topics/social_monitor_topics.dart';

import '../routing/app_router.dart';
import '../routing/feature_catalog.dart';
import 'app_runtime.dart';

final class AppCompositionRoot {
  const AppCompositionRoot._({
    required this.router,
    required this.features,
    required this.routeObserver,
    required this.runtime,
  });

  final GoRouter router;
  final List<AppFeatureDescriptor> features;
  final RouteObserver<ModalRoute<dynamic>> routeObserver;
  final AppShellRuntime runtime;

  factory AppCompositionRoot.production({AppShellRuntime? runtime}) {
    return AppCompositionRoot._build(
      runtime: runtime ?? AppShellRuntime.productionPending(),
      useDemoRoutes: false,
    );
  }

  factory AppCompositionRoot.demo({AppShellRuntime? runtime}) {
    return AppCompositionRoot._build(
      runtime: runtime ?? AppShellRuntime.demo(),
      useDemoRoutes: true,
    );
  }

  factory AppCompositionRoot.bootstrap({AppShellRuntime? runtime}) {
    return AppCompositionRoot.production(runtime: runtime);
  }

  factory AppCompositionRoot._build({
    required AppShellRuntime runtime,
    required bool useDemoRoutes,
  }) {
    final resolvedRuntime = runtime;
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
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const AuthFeatureRoute(),
          title: 'Auth',
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'topics',
        title: 'Topics',
        description: 'Monitoring intents, keywords, and topic rules.',
        route: FeatureRouteContract(id: AppRouteId('topics'), path: '/topics'),
        icon: Icons.track_changes_outlined,
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const TopicsFeatureRoute(),
          title: 'Topics',
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
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const SourcesFeatureRoute(),
          title: 'Sources',
        ),
      ),
      _RouteFeatureDescriptor(
        id: 'feed',
        title: 'Feed',
        description: 'Mentions review, filters, sentiment, and triage.',
        route: FeatureRouteContract(id: AppRouteId('feed'), path: '/feed'),
        icon: Icons.dynamic_feed_outlined,
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const FeedFeatureRoute(),
          title: 'Feed',
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
        status: useDemoRoutes ? 'Shell' : 'Not configured',
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const SummariesFeatureRoute(),
          title: 'Summaries',
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
        builder: _featureBuilder(
          useDemoRoutes: useDemoRoutes,
          demoBuilder: (context) => const SettingsFeatureRoute(),
          title: 'Settings',
        ),
      ),
    ];

    return AppCompositionRoot._(
      features: features,
      routeObserver: routeObserver,
      runtime: resolvedRuntime,
      router: createAppRouter(
        features: features,
        observers: [routeObserver],
        runtime: resolvedRuntime,
      ),
    );
  }
}

WidgetBuilder _featureBuilder({
  required bool useDemoRoutes,
  required WidgetBuilder demoBuilder,
  required String title,
}) {
  if (useDemoRoutes) {
    return demoBuilder;
  }
  return (context) => _RuntimeUnavailableFeaturePage(title: title);
}

final class _RouteFeatureDescriptor implements AppFeatureDescriptor {
  const _RouteFeatureDescriptor({
    required this.id,
    required this.title,
    required this.description,
    required this.route,
    required this.icon,
    required this.status,
    required WidgetBuilder builder,
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

  final WidgetBuilder _builder;

  @override
  Widget buildPage(BuildContext context) => _builder(context);
}

class _RuntimeUnavailableFeaturePage extends StatelessWidget {
  const _RuntimeUnavailableFeaturePage({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AppInlineProblem(
        title: '$title runtime not configured',
        message:
            'Connect the approved backend contract before enabling this normal runtime route.',
        tone: AppProblemTone.warning,
        actionLabel: null,
        onAction: null,
      ),
    );
  }
}
