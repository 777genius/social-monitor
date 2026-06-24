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
import 'runtime_unavailable_feature_page.dart';

typedef AppRouteWidgetBuilder = Widget Function(BuildContext context, Uri uri);

AppRouteWidgetBuilder authFeatureBuilder({required bool useDemoRoutes}) {
  return _featureBuilder(
    useDemoRoutes: useDemoRoutes,
    demoBuilder: (context) => const AuthFeatureRoute(),
    title: 'Auth',
  );
}

AppRouteWidgetBuilder settingsFeatureBuilder({required bool useDemoRoutes}) {
  return _featureBuilder(
    useDemoRoutes: useDemoRoutes,
    demoBuilder: (context) => const SettingsFeatureRoute(),
    title: 'Settings',
  );
}

AppRouteWidgetBuilder topicsFeatureBuilder({
  required bool useDemoRoutes,
  required AppShellRuntime runtime,
}) {
  if (useDemoRoutes) {
    final demoBuilder = buildDemoTopicsFeature();
    return (context, uri) => demoBuilder(context);
  }

  final scope = runtime.workspace.scope;
  final generatedApiRuntime = runtime.generatedApiRuntime;
  final capability = runtime.capabilities.capability('topics');
  if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
    return (context, uri) => TopicsFeatureRoute.generatedApi(
      generatedApiRuntime: generatedApiRuntime,
      scope: scope,
      onOpenTopicSources: (topicId, topicTitle) {
        GoRouter.of(context).go(_topicSourcesPath(topicId, topicTitle));
      },
    );
  }

  return (context, uri) => const RuntimeUnavailableFeaturePage(title: 'Topics');
}

AppRouteWidgetBuilder sourcesFeatureBuilder({
  required bool useDemoRoutes,
  required AppShellRuntime runtime,
}) {
  if (useDemoRoutes) {
    final demoBuilder = buildDemoSourcesFeature();
    return (context, uri) => demoBuilder(context);
  }

  final scope = runtime.workspace.scope;
  final generatedApiRuntime = runtime.generatedApiRuntime;
  final capability = runtime.capabilities.capability('sources');
  if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
    return (context, uri) {
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
    };
  }

  return (context, uri) =>
      const RuntimeUnavailableFeaturePage(title: 'Sources');
}

AppRouteWidgetBuilder feedFeatureBuilder({
  required bool useDemoRoutes,
  required AppShellRuntime runtime,
}) {
  if (useDemoRoutes) {
    return (context, uri) => FeedFeatureRoute();
  }

  final scope = runtime.workspace.scope;
  final generatedApiRuntime = runtime.generatedApiRuntime;
  final capability = runtime.capabilities.capability('feed');
  if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
    return (context, uri) {
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
    };
  }

  return (context, uri) => const RuntimeUnavailableFeaturePage(title: 'Feed');
}

AppRouteWidgetBuilder summariesFeatureBuilder({
  required bool useDemoRoutes,
  required AppShellRuntime runtime,
}) {
  if (useDemoRoutes) {
    return (context, uri) => SummariesFeatureRoute();
  }

  final scope = runtime.workspace.scope;
  final generatedApiRuntime = runtime.generatedApiRuntime;
  final capability = runtime.capabilities.capability('summaries');
  if (scope != null && generatedApiRuntime != null && capability.isEnabled) {
    return (context, uri) => SummariesFeatureRoute.generatedApi(
      generatedApiRuntime: generatedApiRuntime,
      scope: scope,
      userId: runtime.session.userId,
    );
  }

  return (context, uri) =>
      const RuntimeUnavailableFeaturePage(title: 'Summaries');
}

AppRouteWidgetBuilder _featureBuilder({
  required bool useDemoRoutes,
  required WidgetBuilder demoBuilder,
  required String title,
}) {
  if (useDemoRoutes) {
    return (context, uri) => demoBuilder(context);
  }
  return (context, uri) => RuntimeUnavailableFeaturePage(title: title);
}

String _topicSourcesPath(String topicId, String topicTitle) {
  return Uri(
    path: '/sources',
    queryParameters: {'topicId': topicId, 'topicTitle': topicTitle},
  ).toString();
}
