import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../composition/app_runtime.dart';
import 'feature_catalog.dart';

class AppShellPage extends StatelessWidget {
  const AppShellPage({
    super.key,
    required this.features,
    required this.runtime,
    required this.location,
    required this.child,
  });

  final List<AppFeatureDescriptor> features;
  final AppShellRuntime runtime;
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AppAdaptiveShell(
      title: 'Social Monitor',
      destinations: [
        const AppShellDestination(
          label: 'Overview',
          path: '/',
          icon: Icons.monitor_heart_outlined,
        ),
        for (final feature in features)
          AppShellDestination(
            label: feature.title,
            path: feature.route.path,
            icon: feature.icon,
          ),
      ],
      selectedPath: location,
      onDestinationSelected: (path) => context.go(path),
      header: AppWorkspaceSwitcher(
        workspaceName: runtime.workspace.workspaceName,
        tenantName: runtime.workspace.tenantName,
        status: AppStatusBadge(
          label: runtime.workspace.statusLabel,
          tone: runtime.workspace.isAvailable
              ? AppStatusTone.success
              : AppStatusTone.warning,
        ),
        onPressed: () => context.go(_settingsPath),
      ),
      child: child,
    );
  }

  String get _settingsPath {
    for (final feature in features) {
      if (feature.id == 'settings') {
        return feature.route.path;
      }
    }
    return '/';
  }
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
                  status: feature.status,
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
