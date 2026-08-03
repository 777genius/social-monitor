import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_auth/social_monitor_auth.dart';
import 'package:social_monitor_feed/social_monitor_feed.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_interests/social_monitor_interests.dart';
import 'package:social_monitor_settings/social_monitor_settings.dart';
import 'package:social_monitor_sources/social_monitor_sources.dart';
import 'package:social_monitor_summaries/social_monitor_summaries.dart';

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
    final workspaces = [
      for (final workspace in runtime.availableWorkspaces)
        if (workspace.scope case final scope?)
          (
            scope: scope,
            tenantName: workspace.tenantName,
            workspaceName: workspace.workspaceName,
            workspaceRole: workspace.workspaceRole,
            statusLabel: workspace.statusLabel,
          ),
    ];
    return AuthFeatureRoute.runtime(
      generatedApiRuntime: workspaces.isEmpty
          ? runtime.generatedApiRuntime
          : null,
      userId: runtime.session.userId,
      userLabel: runtime.session.userLabel,
      userRole: runtime.session.userRole,
      selectedScope: runtime.workspace.scope,
      workspaces: workspaces,
      onSessionRestored: (session) {
        runtimeController.restoreAuthSession(
          userId: session.userId,
          userLabel: session.userLabel,
          userRole: session.userRole,
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
        userId: runtime.session.userId,
        workspaceRole: runtime.workspace.workspaceRole,
        generatedApiRuntime: generatedApiRuntime,
        themeMode: themeModeController.themeMode,
        onThemeModeChanged: themeModeController.setThemeMode,
      ),
    );
  };
}

AppRouteWidgetBuilder interestsFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    final demoBuilder = buildDemoInterestsFeature();
    return (context, uri) => demoBuilder(context);
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('interests');
    if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
      return InterestsFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        onOpenInterestSources: (interestId, interestTitle) {
          GoRouter.of(
            context,
          ).go(_interestSourcesPath(interestId, interestTitle));
        },
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Interests');
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
      final interestId = uri.queryParameters['interestId']?.trim();
      if (interestId != null && interestId.isNotEmpty) {
        return SourcesFeatureRoute.sourceBindings(
          generatedApiRuntime: generatedApiRuntime,
          scope: scope,
          interestId: interestId,
          interestTitle:
              uri.queryParameters['interestTitle']?.trim().isNotEmpty == true
              ? uri.queryParameters['interestTitle']!.trim()
              : interestId,
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
      final interestId = uri.queryParameters['interestId']?.trim();
      final interestTitle = uri.queryParameters['interestTitle']?.trim();
      return FeedFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        interestId: interestId != null && interestId.isNotEmpty
            ? interestId
            : null,
        interestTitle: interestTitle != null && interestTitle.isNotEmpty
            ? interestTitle
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
      if (runtime.isGuest) {
        final summaryId = uri.pathSegments.length > 1
            ? uri.pathSegments.last.trim()
            : null;
        return PublishedSummariesFeatureRoute.generatedApi(
          generatedApiRuntime: generatedApiRuntime,
          scope: scope,
          summaryId: summaryId == null || summaryId.isEmpty ? null : summaryId,
          onSummarySelected: (selectedSummaryId) {
            GoRouter.of(
              context,
            ).go('/summaries/${Uri.encodeComponent(selectedSummaryId)}');
          },
        );
      }
      return SummariesFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
        userId: runtime.session.userId,
      );
    }

    return const RuntimeUnavailableFeaturePage(title: 'Summaries');
  };
}

AppRouteWidgetBuilder weeklySummariesFeatureBuilder({
  required bool useDemoRoutes,
  required AppRuntimeController runtimeController,
}) {
  if (useDemoRoutes) {
    return (context, uri) => const RuntimeUnavailableFeaturePage(
      title: 'Weekly summary',
    );
  }

  return (context, uri) {
    final runtime = runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final generatedApiRuntime = runtime.generatedApiRuntime;
    final capability = runtime.capabilities.capability('summaries');
    if (scope != null &&
        scope.isValid &&
        generatedApiRuntime is generated.GeneratedApiRuntime &&
        capability.isEnabled) {
      return WeeklySummariesFeatureRoute.generatedApi(
        generatedApiRuntime: generatedApiRuntime,
        scope: scope,
      );
    }
    return const RuntimeUnavailableFeaturePage(title: 'Weekly summary');
  };
}

String _interestSourcesPath(String interestId, String interestTitle) {
  return Uri(
    path: '/sources',
    queryParameters: {'interestId': interestId, 'interestTitle': interestTitle},
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
