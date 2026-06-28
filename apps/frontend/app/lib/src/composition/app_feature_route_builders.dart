import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_auth/social_monitor_auth.dart';
import 'package:social_monitor_feed/social_monitor_feed.dart';
import 'package:social_monitor_settings/social_monitor_settings.dart';
import 'package:social_monitor_sources/social_monitor_sources.dart';
import 'package:social_monitor_summaries/social_monitor_summaries.dart';
import 'package:social_monitor_topics/social_monitor_topics.dart';

import 'app_demo_feature_builders.dart';
import 'app_runtime.dart';
import 'app_theme_mode_controller.dart';
import 'runtime_unavailable_feature_page.dart';

typedef AppRouteWidgetBuilder = Widget Function(BuildContext context, Uri uri);

AppRouteWidgetBuilder authFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    return (context, uri) => const AuthFeatureRoute();
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    return AuthFeatureRoute.runtime(
      generatedApiRuntime: runtime.generatedApiRuntime,
      userId: runtime.session.userId,
      userLabel: runtime.session.userLabel,
      selectedScope: runtime.workspace.scope,
      workspaces: [
        for (final workspace in runtime.availableWorkspaces)
          if (workspace.scope case final scope?)
            (
              scope: scope,
              tenantName: workspace.tenantName,
              workspaceName: workspace.workspaceName,
              workspaceRole: workspace.workspaceRole,
              statusLabel: workspace.statusLabel,
            ),
      ],
      onSessionRestored: (session) {
        runtimeController.restoreAuthSession(
          userId: session.userId,
          userLabel: session.userLabel,
          selectedWorkspace: _appWorkspace(session.selectedWorkspace),
          availableWorkspaces: session.workspaces
              .map(_appWorkspace)
              .toList(growable: false),
        );
      },
      onWorkspaceSelected: (workspace) {
        runtimeController.selectWorkspace(workspace.scope);
        GoRouter.of(context).go('/');
      },
    );
  };
}

AppRouteWidgetBuilder settingsFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
  required AppThemeModeController themeModeController,
}) {
  if (useDemoRoutes) {
    return (context, uri) => AnimatedBuilder(
      animation: themeModeController,
      builder: (context, _) => SettingsFeatureRoute(
        themeMode: themeModeController.themeMode,
        onThemeModeChanged: themeModeController.setThemeMode,
      ),
    );
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final capability = runtime.capabilities.capability('settings');
    final generatedApiRuntime = runtime.generatedApiRuntime;
    if (scope == null || capability.isDisabled || generatedApiRuntime == null) {
      return const RuntimeUnavailableFeaturePage(title: 'Settings');
    }
    return AnimatedBuilder(
      animation: themeModeController,
      builder: (context, _) => SettingsFeatureRoute.runtime(
        scope: scope,
        generatedApiRuntime: generatedApiRuntime,
        themeMode: themeModeController.themeMode,
        onThemeModeChanged: themeModeController.setThemeMode,
      ),
    );
  };
}

AppRouteWidgetBuilder topicsFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    final demoBuilder = buildDemoTopicsFeature();
    return (context, uri) => demoBuilder(context);
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('topics');
    if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
      return TopicsFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        onOpenTopicSources: (topicId, topicTitle) {
          GoRouter.of(context).go(_topicSourcesPath(topicId, topicTitle));
        },
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Topics');
  };
}

AppRouteWidgetBuilder sourcesFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    final demoBuilder = buildDemoSourcesFeature();
    return (context, uri) => demoBuilder(context);
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('sources');
    if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
      final topicId = uri.queryParameters['topicId']?.trim();
      if (topicId != null && topicId.isNotEmpty) {
        return SourcesFeatureRoute.sourceBindings(
          generatedApiRuntime: generatedApiRuntime,
          scope: scope,
          topicId: topicId,
          topicTitle:
              uri.queryParameters['topicTitle']?.trim().isNotEmpty == true
              ? uri.queryParameters['topicTitle']!.trim()
              : topicId,
        );
      }
      return SourcesFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Sources');
  };
}

AppRouteWidgetBuilder feedFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    return (context, uri) => FeedFeatureRoute();
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('feed');
    if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
      final topicId = uri.queryParameters['topicId']?.trim();
      final topicTitle = uri.queryParameters['topicTitle']?.trim();
      return FeedFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        topicId: topicId != null && topicId.isNotEmpty ? topicId : null,
        topicTitle: topicTitle != null && topicTitle.isNotEmpty
            ? topicTitle
            : null,
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Feed');
  };
}

AppRouteWidgetBuilder summariesFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    return (context, uri) => SummariesFeatureRoute();
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('summaries');
    if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
      return SummariesFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        userId: runtime.session.userId,
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Summaries');
  };
}

String _topicSourcesPath(String topicId, String topicTitle) {
  return Uri(
    path: '/sources',
    queryParameters: {'topicId': topicId, 'topicTitle': topicTitle},
  ).toString();
}

AppWorkspaceSnapshot _appWorkspace(AuthWorkspaceRouteSnapshot workspace) {
  return AppWorkspaceSnapshot(
    tenantName: workspace.tenantName,
    workspaceName: workspace.workspaceName,
    statusLabel: workspace.statusLabel,
    workspaceRole: workspace.workspaceRole,
    scope: workspace.scope,
  );
}
