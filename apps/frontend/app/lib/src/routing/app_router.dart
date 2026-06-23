import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../composition/app_runtime.dart';
import 'app_shell_page.dart';
import 'feature_catalog.dart';

GoRouter createAppRouter({
  required List<AppFeatureDescriptor> features,
  required List<NavigatorObserver> observers,
  required AppShellRuntime runtime,
}) {
  return GoRouter(
    initialLocation: AppRoutes.dashboard,
    observers: observers,
    redirect: (context, state) {
      final path = state.uri.path;
      if (!runtime.session.isSignedIn && path != AppRoutes.auth) {
        return AppRoutes.auth;
      }

      final feature = _featureForPath(features, path);
      if (feature != null &&
          feature.route.requiresWorkspace &&
          !runtime.workspace.isAvailable) {
        return AppRoutes.auth;
      }
      return null;
    },
    errorBuilder: (context, state) {
      return UnknownRoutePage(location: state.uri.toString());
    },
    routes: [
      ShellRoute(
        builder: (context, state, child) {
          return AppShellPage(
            features: features,
            runtime: runtime,
            location: state.uri.path,
            child: child,
          );
        },
        routes: [
          GoRoute(
            path: AppRoutes.dashboard,
            builder: (context, state) {
              return FeatureOverviewPage(features: features, runtime: runtime);
            },
          ),
          for (final feature in features)
            GoRoute(
              path: feature.route.path,
              builder: (context, state) => feature.buildPage(context),
            ),
        ],
      ),
    ],
  );
}

abstract final class AppRoutes {
  static const dashboard = '/';
  static const auth = '/auth';
}

AppFeatureDescriptor? _featureForPath(
  List<AppFeatureDescriptor> features,
  String path,
) {
  for (final feature in features) {
    if (feature.route.path == path) {
      return feature;
    }
  }
  return null;
}
