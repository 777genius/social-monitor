import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding_overview.dart';
import '../formatters/source_binding_display_formatters.dart';

class SourceProviderStatusPanel extends StatelessWidget {
  const SourceProviderStatusPanel({super.key, required this.state});

  final AsyncViewState<SourceBindingOverview> state;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      ReadyViewState<SourceBindingOverview>(:final value)
          when value.hasProviderStatus =>
        _ProviderStatusSpacing(child: _ProviderStatusContent(overview: value)),
      LoadingViewState<SourceBindingOverview>(:final previousValue)
          when previousValue?.hasProviderStatus == true =>
        _ProviderStatusSpacing(
          child: _ProviderStatusContent(
            overview: previousValue!,
            isRefreshing: true,
          ),
        ),
      FailureViewState<SourceBindingOverview>(:final failure) =>
        _ProviderStatusSpacing(
          child: AppInlineProblem(
            title: 'Provider status unavailable',
            message: failure.message,
            tone: AppProblemTone.warning,
          ),
        ),
      _ => const SizedBox.shrink(),
    };
  }
}

class _ProviderStatusSpacing extends StatelessWidget {
  const _ProviderStatusSpacing({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: child,
    );
  }
}

class _ProviderStatusContent extends StatelessWidget {
  const _ProviderStatusContent({
    required this.overview,
    this.isRefreshing = false,
  });

  final SourceBindingOverview overview;
  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    final providerGroups = overview.summary.providerBreakdown
        .where((provider) => provider.degradationReasons.isNotEmpty)
        .toList(growable: false);

    if (providerGroups.isEmpty) {
      return const SizedBox.shrink();
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Provider status',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                if (isRefreshing)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            ...providerGroups.map(
              (provider) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: _ProviderStatusGroup(provider: provider),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProviderStatusGroup extends StatelessWidget {
  const _ProviderStatusGroup({required this.provider});

  final SourceBindingOverviewProviderBreakdown provider;

  @override
  Widget build(BuildContext context) {
    final providerLabel = sourceProviderLabel(provider.providerKey);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(sourceBindingProviderIcon(provider.providerKey), size: 20),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                providerLabel,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
            AppStatusBadge(label: '${provider.totalBindings.round()}'),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        ...provider.degradationReasons.map(
          (reason) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: _ProviderReasonRow(reason: reason),
          ),
        ),
      ],
    );
  }
}

class _ProviderReasonRow extends StatelessWidget {
  const _ProviderReasonRow({required this.reason});

  final SourceBindingOverviewDegradationReason reason;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppStatusBadge(
          label: reason.code,
          tone: _severityTone(reason.severity),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            reason.operatorAction,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          '${reason.affectedBindings.round()}',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

AppStatusTone _severityTone(SourceBindingOverviewDegradationSeverity severity) {
  return switch (severity) {
    SourceBindingOverviewDegradationSeverity.critical => AppStatusTone.danger,
    SourceBindingOverviewDegradationSeverity.warning => AppStatusTone.warning,
    SourceBindingOverviewDegradationSeverity.info ||
    SourceBindingOverviewDegradationSeverity.unknown => AppStatusTone.neutral,
  };
}
