import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../composition/app_composition_root.dart';

class SocialMonitorApp extends StatelessWidget {
  const SocialMonitorApp({super.key, required this.composition});

  final AppCompositionRoot composition;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final darkTheme = AppTheme.dark();

    return ModularityRoot(
      observer: composition.routeObserver,
      interceptors: kDebugMode
          ? const [_DebugModuleLifecycleInterceptor()]
          : null,
      lifecycleLogger: kDebugMode ? ModularityRoot.defaultDebugLogger : null,
      child: AnimatedBuilder(
        animation: composition.themeModeController,
        builder: (context, _) {
          final themeMode = composition.themeModeController.themeMode;

          return AppHeadlessScope(
            theme: theme,
            darkTheme: darkTheme,
            themeMode: themeMode,
            appBuilder: (overlayBuilder) => MaterialApp.router(
              title: 'Social Monitor',
              debugShowCheckedModeBanner: false,
              theme: theme,
              darkTheme: darkTheme,
              themeMode: themeMode,
              builder: (context, child) => overlayBuilder(
                context,
                FocusTraversalGroup(
                  policy: WidgetOrderTraversalPolicy(),
                  child: SelectionArea(child: child ?? const SizedBox.shrink()),
                ),
              ),
              routerConfig: composition.router,
            ),
          );
        },
      ),
    );
  }
}

final class _DebugModuleLifecycleInterceptor implements ModuleInterceptor {
  const _DebugModuleLifecycleInterceptor();

  @override
  void onInit(Module module) {
    debugPrint('[Modularity] INIT ${module.runtimeType}');
  }

  @override
  void onLoaded(Module module) {
    debugPrint('[Modularity] LOADED ${module.runtimeType}');
  }

  @override
  void onError(Module module, Object error) {
    debugPrint('[Modularity] ERROR ${module.runtimeType}: $error');
  }

  @override
  void onDispose(Module module) {
    debugPrint('[Modularity] DISPOSE ${module.runtimeType}');
  }
}
