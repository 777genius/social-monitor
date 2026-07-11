import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../composition/app_runtime.dart';
import '../composition/app_theme_mode_controller.dart';
import 'app_feature_access.dart';
import 'app_shell_theme_menu_card.dart';
import 'feature_catalog.dart';
import 'guest_github_sidebar_card.dart';

class AppShellPage extends StatelessWidget {
  const AppShellPage({
    super.key,
    required this.features,
    required this.runtimeController,
    required this.themeModeController,
    required this.location,
    required this.child,
  });

  final List<AppFeatureDescriptor> features;
  final AppRuntimeController runtimeController;
  final AppThemeModeController themeModeController;
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: runtimeController,
      builder: (context, _) {
        final runtime = runtimeController.runtime;
        final visibleFeatures = visibleAppFeatures(runtime, features);
        return AppAdaptiveShell(
          title: runtime.isGuest ? 'Social Monitor Stories' : 'Social Monitor',
          destinations: [
            if (runtime.isAdmin)
              const AppShellDestination(
                label: 'Overview',
                path: '/',
                icon: Icons.monitor_heart_outlined,
              ),
            for (final feature in visibleFeatures)
              AppShellDestination(
                label: runtime.isGuest && feature.id == 'summaries'
                    ? 'Latest summary'
                    : feature.title,
                path: feature.route.path,
                icon: feature.icon,
              ),
          ],
          selectedPath: location,
          onDestinationSelected: (path) => context.go(path),
          appBarActions: [
            _CompactThemeModeMenu(controller: themeModeController),
          ],
          sidebarFooter: [
            AppShellThemeMenuCard(controller: themeModeController),
            if (runtime.isGuest) const GuestGitHubSidebarCard(),
          ],
          child: child,
        );
      },
    );
  }
}

class _CompactThemeModeMenu extends StatelessWidget {
  const _CompactThemeModeMenu({required this.controller});

  final AppThemeModeController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return PopupMenuButton<ThemeMode>(
          key: const ValueKey('app-compact-theme-mode-menu'),
          tooltip: 'Theme',
          icon: Icon(_themeIcon(controller.themeMode)),
          onSelected: controller.setThemeMode,
          itemBuilder: (context) => [
            _themeMenuItem(
              mode: ThemeMode.system,
              selectedMode: controller.themeMode,
              icon: Icons.brightness_auto_outlined,
              label: 'System',
            ),
            _themeMenuItem(
              mode: ThemeMode.light,
              selectedMode: controller.themeMode,
              icon: Icons.light_mode_outlined,
              label: 'Light',
            ),
            _themeMenuItem(
              mode: ThemeMode.dark,
              selectedMode: controller.themeMode,
              icon: Icons.dark_mode_outlined,
              label: 'Dark',
            ),
          ],
        );
      },
    );
  }
}

PopupMenuItem<ThemeMode> _themeMenuItem({
  required ThemeMode mode,
  required ThemeMode selectedMode,
  required IconData icon,
  required String label,
}) {
  return PopupMenuItem<ThemeMode>(
    value: mode,
    child: Row(
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: Text(label)),
        if (mode == selectedMode) const Icon(Icons.check, size: 18),
      ],
    ),
  );
}

IconData _themeIcon(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.system => Icons.brightness_auto_outlined,
    ThemeMode.light => Icons.light_mode_outlined,
    ThemeMode.dark => Icons.dark_mode_outlined,
  };
}

class FeatureOverviewPage extends StatelessWidget {
  const FeatureOverviewPage({
    super.key,
    required this.features,
    required this.runtime,
  });

  final List<AppFeatureDescriptor> features;
  final AppShellRuntime runtime;

  @override
  Widget build(BuildContext context) {
    final screen = AppScreenClass.of(context);

    return AppPageSurface(
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: AppSectionHeader(
              eyebrow: 'Workspace',
              title: 'Monitoring command center',
              description:
                  'Feature slices are wired through app routing and ready for domain-specific implementation.',
              trailing: AppStatusBadge(label: runtime.session.userLabel),
            ),
          ),
          if (!runtime.workspace.isAvailable)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(top: AppSpacing.md),
                child: AppPermissionRepairSurface(
                  title: 'Workspace required',
                  message: 'Select a workspace before opening monitoring data.',
                  reasonCode: 'workspace_missing',
                  actionLabel: 'Open auth',
                  onAction: null,
                ),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            sliver: SliverGrid.builder(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: screen.when(compact: 1, medium: 2, expanded: 3),
                childAspectRatio: screen.isCompact ? 1.95 : 1.55,
                crossAxisSpacing: AppSpacing.md,
                mainAxisSpacing: AppSpacing.md,
              ),
              itemCount: features.length,
              itemBuilder: (context, index) {
                final feature = features[index];
                return AppFeatureCard(
                  title: feature.title,
                  description: feature.description,
                  icon: feature.icon,
                  status: _featureStatus(feature, runtime),
                  onTap: () => context.go(feature.route.path),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

String _featureStatus(AppFeatureDescriptor feature, AppShellRuntime runtime) {
  if (feature.status == 'Shell') {
    return feature.status;
  }
  if (feature.id == 'auth') {
    if (runtime.session.isSignedIn && runtime.workspace.isAvailable) {
      return 'Runtime';
    }
    return runtime.availableWorkspaces.isEmpty
        ? 'Runtime not configured'
        : 'Workspace required';
  }
  final capability = runtime.capabilities.capability(feature.id);
  if (runtime.workspace.scope == null) {
    return 'Workspace required';
  }
  if (capability.isDisabled) {
    return capability.disabledReasonCode ?? 'Disabled';
  }
  return feature.id == 'settings' ? 'Runtime' : 'API';
}

class UnknownRoutePage extends StatelessWidget {
  const UnknownRoutePage({super.key, required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AppInlineProblem(
        title: 'Route not found',
        message: 'No frontend route is registered for $location.',
        tone: AppProblemTone.warning,
        actionLabel: 'Go to overview',
        onAction: () => context.go('/'),
      ),
    );
  }
}
