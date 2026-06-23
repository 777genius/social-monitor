import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/auth_session.dart';
import '../stores/auth_bootstrap_store.dart';

class AuthFeaturePage extends StatefulWidget {
  const AuthFeaturePage({super.key, required this.store});

  final AuthBootstrapStore store;

  @override
  State<AuthFeaturePage> createState() => _AuthFeaturePageState();
}

class _AuthFeaturePageState extends State<AuthFeaturePage> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.store.restoreSession());
  }

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AnimatedBuilder(
        animation: widget.store,
        builder: (context, child) {
          return CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Access',
                  title: 'Auth and workspace session',
                  description:
                      'Session restore, workspace bootstrap and access repair are the first frontend runtime checkpoints.',
                ),
              ),
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 680),
                    child: _AuthStatePanel(store: widget.store),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _AuthStatePanel extends StatelessWidget {
  const _AuthStatePanel({required this.store});

  final AuthBootstrapStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    return switch (state) {
      InitialViewState() || LoadingViewState() => const AppInlineProblem(
        title: 'Restoring session',
        message: 'Checking session and workspace access.',
        tone: AppProblemTone.neutral,
      ),
      ReadyViewState<AuthSession>(:final value) => AppPermissionRepairSurface(
        title: 'Session restored',
        message:
            '${value.userLabel} is working in ${value.selectedWorkspace!.workspaceName}.',
        reasonCode: 'session.ready',
        actionLabel: 'Refresh session',
        onAction: () => unawaited(store.restoreSession()),
        tone: AppProblemTone.neutral,
      ),
      PermissionRequiredViewState<AuthSession>() => _WorkspaceSelectionPanel(
        store: store,
      ),
      FailureViewState<AuthSession>(:final failure) =>
        AppPermissionRepairSurface(
          title: 'Session restore failed',
          message: failure.message,
          reasonCode: failure.code ?? 'session.restore_failed',
          actionLabel: 'Refresh session',
          onAction: () => unawaited(store.restoreSession()),
          tone: AppProblemTone.warning,
        ),
      EmptyViewState<AuthSession>() ||
      RetryingViewState<AuthSession>() => AppPermissionRepairSurface(
        title: 'Workspace required',
        message: 'Select a workspace before opening monitoring data.',
        reasonCode: 'workspace_missing',
        actionLabel: 'Refresh session',
        onAction: () => unawaited(store.restoreSession()),
      ),
    };
  }
}

class _WorkspaceSelectionPanel extends StatelessWidget {
  const _WorkspaceSelectionPanel({required this.store});

  final AuthBootstrapStore store;

  @override
  Widget build(BuildContext context) {
    final session = store.session;
    final workspaces = session?.workspaces ?? const [];

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppPermissionRepairSurface(
          title: 'Workspace required',
          message: 'Select a workspace before opening monitoring data.',
          reasonCode: 'workspace_missing',
          actionLabel: 'Refresh session',
          onAction: () => unawaited(store.restoreSession()),
        ),
        if (workspaces.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: Theme.of(context).dividerColor),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Material(
                type: MaterialType.transparency,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final workspace in workspaces)
                      ListTile(
                        title: Text(workspace.workspaceName),
                        subtitle: Text(workspace.tenantName),
                        trailing: AppStatusBadge(label: workspace.statusLabel),
                        onTap: () {
                          unawaited(store.selectWorkspace(workspace.scope));
                        },
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
