import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_sources/social_monitor_sources.dart';
import 'package:social_monitor_topics/social_monitor_topics.dart';

WidgetBuilder buildDemoTopicsFeature() {
  return (context) => TopicsFeatureRoute.demo(
    onOpenTopicSources: (topicId, topicTitle) {
      GoRouter.of(context).go(_demoTopicSourcesPath(topicId, topicTitle));
    },
  );
}

WidgetBuilder buildDemoSourcesFeature() {
  return (context) {
    final uri = GoRouterState.of(context).uri;
    final topicId = uri.queryParameters['topicId']?.trim();
    if (topicId != null && topicId.isNotEmpty) {
      return SourcesFeatureRoute.sourceBindingsDemo(
        topicId: topicId,
        topicTitle: _topicTitleFrom(uri, topicId),
      );
    }
    return SourcesFeatureRoute.sourceProfilesDemo();
  };
}

String _topicTitleFrom(Uri uri, String fallback) {
  final topicTitle = uri.queryParameters['topicTitle']?.trim();
  return topicTitle != null && topicTitle.isNotEmpty ? topicTitle : fallback;
}

String _demoTopicSourcesPath(String topicId, String topicTitle) {
  return Uri(
    path: '/sources',
    queryParameters: {'topicId': topicId, 'topicTitle': topicTitle},
  ).toString();
}
