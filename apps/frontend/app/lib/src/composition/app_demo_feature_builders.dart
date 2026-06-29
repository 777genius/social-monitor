import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_interests/social_monitor_interests.dart';
import 'package:social_monitor_sources/social_monitor_sources.dart';

WidgetBuilder buildDemoInterestsFeature() {
  return (context) => InterestsFeatureRoute.demo(
    onOpenInterestSources: (interestId, interestTitle) {
      GoRouter.of(
        context,
      ).go(_demoInterestSourcesPath(interestId, interestTitle));
    },
  );
}

WidgetBuilder buildDemoSourcesFeature() {
  return (context) {
    final uri = GoRouterState.of(context).uri;
    final interestId = uri.queryParameters['interestId']?.trim();
    if (interestId != null && interestId.isNotEmpty) {
      return SourcesFeatureRoute.sourceBindingsDemo(
        interestId: interestId,
        interestTitle: _interestTitleFrom(uri, interestId),
      );
    }
    return SourcesFeatureRoute.sourceProfilesDemo();
  };
}

String _interestTitleFrom(Uri uri, String fallback) {
  final interestTitle = uri.queryParameters['interestTitle']?.trim();
  return interestTitle != null && interestTitle.isNotEmpty
      ? interestTitle
      : fallback;
}

String _demoInterestSourcesPath(String interestId, String interestTitle) {
  return Uri(
    path: '/sources',
    queryParameters: {'interestId': interestId, 'interestTitle': interestTitle},
  ).toString();
}
