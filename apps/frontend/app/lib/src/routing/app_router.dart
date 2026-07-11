import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../composition/app_runtime.dart';
import '../composition/app_theme_mode_controller.dart';
import 'app_feature_access.dart';
import 'app_shell_page.dart';
import 'feature_catalog.dart';

GoRouter createAppRouter({
  required List<AppFeatureDescriptor> features,
  required List<NavigatorObserver> observers,
  required AppRuntimeController runtimeController,
  required AppThemeModeController themeModeController,
  String initialLocation = AppRoutes.dashboard,
}) {
  return GoRouter(
    initialLocation: initialLocation,
    observers: observers,
    refreshListenable: runtimeController,
    redirect: (context, state) {
      final runtime = runtimeController.runtime;
      final path = state.uri.path;
      if (!runtime.session.isSignedIn && path != AppRoutes.auth) {
        return AppRoutes.auth;
      }

      if (runtime.session.isRestoring) {
        return null;
      }

      if (runtime.session.isSignedIn && runtime.isGuest && path == '/') {
        return AppRoutes.summaries;
      }

      final feature = _featureForPath(features, path);
      if (feature != null && !isAppFeatureVisible(runtime, feature)) {
        return runtime.isGuest ? AppRoutes.summaries : AppRoutes.dashboard;
      }
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
            runtimeController: runtimeController,
            themeModeController: themeModeController,
            location: state.uri.path,
            child: child,
          );
        },
        routes: [
          GoRoute(
            path: AppRoutes.dashboard,
            pageBuilder: (context, state) => NoTransitionPage<void>(
              key: state.pageKey,
              child: FeatureOverviewPage(
                features: features,
                runtime: runtimeController.runtime,
              ),
            ),
          ),
          for (final feature in features)
            GoRoute(
              path: feature.route.path,
              pageBuilder: (context, state) => NoTransitionPage<void>(
                key: state.pageKey,
                child: _RuntimeFeaturePage(
                  feature: feature,
                  uri: state.uri,
                  runtimeController: runtimeController,
                ),
              ),
            ),
          GoRoute(
            path: AppRoutes.summaryDetail,
            pageBuilder: (context, state) {
              final summaries = features.firstWhere(
                (feature) => feature.id == 'summaries',
              );
              return NoTransitionPage<void>(
                key: state.pageKey,
                child: _RuntimeFeaturePage(
                  feature: summaries,
                  uri: state.uri,
                  runtimeController: runtimeController,
                ),
              );
            },
          ),
        ],
      ),
    ],
  );
}

class _RuntimeFeaturePage extends StatefulWidget {
  const _RuntimeFeaturePage({
    required this.feature,
    required this.uri,
    required this.runtimeController,
  });

  final AppFeatureDescriptor feature;
  final Uri uri;
  final AppRuntimeController runtimeController;

  @override
  State<_RuntimeFeaturePage> createState() => _RuntimeFeaturePageState();
}

class _RuntimeFeaturePageState extends State<_RuntimeFeaturePage> {
  Widget? _child;
  String? _runtimeKey;

  @override
  void initState() {
    super.initState();
    widget.runtimeController.addListener(_handleRuntimeChanged);
  }

  @override
  void didUpdateWidget(covariant _RuntimeFeaturePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.runtimeController != widget.runtimeController) {
      oldWidget.runtimeController.removeListener(_handleRuntimeChanged);
      widget.runtimeController.addListener(_handleRuntimeChanged);
    }
    if (oldWidget.feature != widget.feature || oldWidget.uri != widget.uri) {
      _child = null;
      _runtimeKey = null;
    }
  }

  void _handleRuntimeChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final runtime = widget.runtimeController.runtime;
    final scope = runtime.workspace.scope;
    final runtimeKey = [
      runtime.session.isSignedIn,
      runtime.session.isRestoring,
      runtime.session.userId,
      runtime.session.userRole,
      scope?.tenantId,
      scope?.workspaceId,
    ].join('|');
    if (_child == null || _runtimeKey != runtimeKey) {
      _runtimeKey = runtimeKey;
      _child = widget.feature.buildPage(context, widget.uri);
    }
    return _child!;
  }

  @override
  void dispose() {
    widget.runtimeController.removeListener(_handleRuntimeChanged);
    super.dispose();
  }
}

abstract final class AppRoutes {
  static const dashboard = '/';
  static const auth = '/auth';
  static const summaries = '/summaries';
  static const summaryDetail = '/summaries/:summaryId';
  static const initialFromEnvironment = String.fromEnvironment(
    'SOCIAL_MONITOR_INITIAL_ROUTE',
    defaultValue: dashboard,
  );
}

AppFeatureDescriptor? _featureForPath(
  List<AppFeatureDescriptor> features,
  String path,
) {
  for (final feature in features) {
    if (feature.route.path == path ||
        (feature.id == 'summaries' && path.startsWith('/summaries/'))) {
      return feature;
    }
  }
  return null;
}
