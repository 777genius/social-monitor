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
              builder: overlayBuilder,
              routerConfig: composition.router,
            ),
          );
        },
      ),
    );
  }
}
