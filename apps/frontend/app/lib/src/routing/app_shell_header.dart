import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../composition/app_runtime.dart';
import '../composition/app_theme_mode_controller.dart';

class AppShellHeader extends StatelessWidget {
  const AppShellHeader({
    super.key,
    required this.runtime,
    required this.themeModeController,
    required this.onOpenSettings,
  });

  final AppShellRuntime runtime;
  final AppThemeModeController themeModeController;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppWorkspaceSwitcher(
          workspaceName: runtime.workspace.workspaceName,
          tenantName: runtime.workspace.tenantName,
          status: AppStatusBadge(
            label: runtime.workspace.statusLabel,
            tone: runtime.workspace.isAvailable
                ? AppStatusTone.success
                : AppStatusTone.warning,
          ),
          onPressed: onOpenSettings,
        ),
        const SizedBox(height: AppSpacing.sm),
        _ThemeModeSwitcher(controller: themeModeController),
      ],
    );
  }
}

class _ThemeModeSwitcher extends StatelessWidget {
  const _ThemeModeSwitcher({required this.controller});

  final AppThemeModeController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final colorScheme = Theme.of(context).colorScheme;
        final borderColor = Theme.of(context).brightness == Brightness.dark
            ? AppColors.darkBorder
            : AppColors.border;

        return DecoratedBox(
          decoration: BoxDecoration(
            color: colorScheme.surface,
            border: Border.all(color: borderColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xs),
            child: Row(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xs,
                  ),
                  child: Text(
                    'Theme',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const Spacer(),
                _ThemeModeButton(
                  mode: ThemeMode.system,
                  selectedMode: controller.themeMode,
                  icon: Icons.brightness_auto_outlined,
                  label: 'System theme',
                  onSelected: controller.setThemeMode,
                ),
                _ThemeModeButton(
                  mode: ThemeMode.light,
                  selectedMode: controller.themeMode,
                  icon: Icons.light_mode_outlined,
                  label: 'Light theme',
                  onSelected: controller.setThemeMode,
                ),
                _ThemeModeButton(
                  mode: ThemeMode.dark,
                  selectedMode: controller.themeMode,
                  icon: Icons.dark_mode_outlined,
                  label: 'Dark theme',
                  onSelected: controller.setThemeMode,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ThemeModeButton extends StatelessWidget {
  const _ThemeModeButton({
    required this.mode,
    required this.selectedMode,
    required this.icon,
    required this.label,
    required this.onSelected,
  });

  final ThemeMode mode;
  final ThemeMode selectedMode;
  final IconData icon;
  final String label;
  final ValueChanged<ThemeMode> onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final selected = mode == selectedMode;

    return SizedBox.square(
      dimension: 36,
      child: IconButton(
        key: ValueKey('app-theme-mode-${mode.name}'),
        tooltip: label,
        icon: Icon(icon, size: 18),
        constraints: const BoxConstraints.tightFor(width: 36, height: 36),
        padding: EdgeInsets.zero,
        color: selected ? colorScheme.onPrimaryContainer : null,
        style: IconButton.styleFrom(
          backgroundColor: selected
              ? colorScheme.primaryContainer
              : Colors.transparent,
          foregroundColor: selected
              ? colorScheme.onPrimaryContainer
              : colorScheme.onSurfaceVariant,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        onPressed: () => onSelected(mode),
      ),
    );
  }
}
