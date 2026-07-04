import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../composition/app_theme_mode_controller.dart';

/// Sidebar theme selector, pinned to the sidebar footer.
class AppShellThemeMenuCard extends StatelessWidget {
  const AppShellThemeMenuCard({super.key, required this.controller});

  final AppThemeModeController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final mode = controller.themeMode;
        return AppSidebarMenuCard<ThemeMode>(
          key: const ValueKey('app-theme-mode-menu'),
          icon: _themeIcon(mode),
          label: _themeLabel(mode),
          value: mode,
          onSelected: controller.setThemeMode,
          items: [
            for (final option in ThemeMode.values)
              AppSidebarMenuItem<ThemeMode>(
                value: option,
                icon: _themeIcon(option),
                label: _themeLabel(option),
                itemKey: ValueKey('app-theme-mode-${option.name}'),
              ),
          ],
        );
      },
    );
  }
}

IconData _themeIcon(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.system => Icons.brightness_auto_outlined,
    ThemeMode.light => Icons.light_mode_outlined,
    ThemeMode.dark => Icons.dark_mode_outlined,
  };
}

String _themeLabel(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.system => 'System',
    ThemeMode.light => 'Light',
    ThemeMode.dark => 'Dark',
  };
}
