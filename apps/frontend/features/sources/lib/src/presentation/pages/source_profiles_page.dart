import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_profile.dart';
import '../components/source_profiles_layout.dart';
import '../stores/source_profiles_store.dart';

class SourceProfilesPage extends StatefulWidget {
  const SourceProfilesPage({
    super.key,
    required this.store,
    this.autoload = true,
  });

  final SourceProfilesStore store;
  final bool autoload;

  @override
  State<SourceProfilesPage> createState() => _SourceProfilesPageState();
}

class _SourceProfilesPageState extends State<SourceProfilesPage> {
  @override
  void initState() {
    super.initState();
    if (widget.autoload) {
      unawaited(widget.store.load());
    }
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
                  eyebrow: 'Capabilities',
                  title: 'Source profiles',
                  description:
                      'Backend-real provider capabilities and runtime readiness. No credentials, no connections, read-only.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _SourceProfilesBody(store: widget.store),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SourceProfilesBody extends StatelessWidget {
  const _SourceProfilesBody({required this.store});

  final SourceProfilesStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    return switch (state) {
      ReadyViewState<PageResult<SourceProfile>>(:final value) =>
        SourceProfilesLayout(
          profiles: value.items,
          isExpanded: store.isExpanded,
          onToggleLimitations: store.toggleLimitations,
        ),
      LoadingViewState<PageResult<SourceProfile>>(:final previousValue) =>
        previousValue == null
            ? const Center(child: CircularProgressIndicator())
            : SourceProfilesLayout(
                profiles: previousValue.items,
                isExpanded: store.isExpanded,
                onToggleLimitations: store.toggleLimitations,
              ),
      EmptyViewState<PageResult<SourceProfile>>() => const AppInlineProblem(
        title: 'No source profiles',
        message: 'The backend did not return provider profiles.',
        tone: AppProblemTone.neutral,
      ),
      FailureViewState<PageResult<SourceProfile>>(:final failure) =>
        AppInlineProblem(
          title: 'Source profiles unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      PermissionRequiredViewState<PageResult<SourceProfile>>(
        :final permissionKey,
        :final message,
      ) =>
        AppPermissionRepairSurface(
          title: 'Source profile permission required',
          message: message,
          reasonCode: permissionKey,
          actionLabel: 'Refresh profiles',
          onAction: () => unawaited(store.load()),
        ),
      _ => const AppInlineProblem(
        title: 'Source profiles',
        message: 'Load provider profiles to review readiness.',
        tone: AppProblemTone.neutral,
      ),
    };
  }
}
