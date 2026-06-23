import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_health_snapshot.dart';
import '../../domain/entities/source_summary.dart';
import '../../domain/value_objects/credential_health.dart';
import '../../domain/value_objects/source_collection_status.dart';
import '../stores/sources_catalog_store.dart';

class SourcesFeaturePage extends StatefulWidget {
  const SourcesFeaturePage({
    super.key,
    required this.store,
    this.autoload = true,
  });

  final SourcesCatalogStore store;
  final bool autoload;

  @override
  State<SourcesFeaturePage> createState() => _SourcesFeaturePageState();
}

class _SourcesFeaturePageState extends State<SourcesFeaturePage> {
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
          final repairCandidate = widget.store.repairCandidate;

          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Collection',
                  title: 'Sources and ingestion controls',
                  description:
                      'Connect sources, repair credentials and review collection health without exposing provider secrets.',
                  trailing: AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Connect source',
                        icon: Icons.add_link,
                        onPressed: widget.store.connectIntent.isEnabled
                            ? () => unawaited(widget.store.connectDemoSource())
                            : null,
                      ),
                    ],
                  ),
                ),
              ),
              if (repairCandidate != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.md),
                    child: AppPermissionRepairSurface(
                      title: '${repairCandidate.name} credential attention',
                      message:
                          'One source needs reconnect. Token details stay outside frontend logs and fixtures.',
                      reasonCode: 'source.credential_expired',
                      actionLabel: 'Reconnect',
                      onAction:
                          widget.store
                              .reconnectIntentFor(repairCandidate)
                              .isEnabled
                          ? () => unawaited(
                              widget.store.reconnect(repairCandidate),
                            )
                          : null,
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _SourcesBody(store: widget.store),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SourcesBody extends StatelessWidget {
  const _SourcesBody({required this.store});

  final SourcesCatalogStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final items = switch (state) {
      ReadyViewState<PageResult<SourceSummary>>(:final value) => value.items,
      _ => const <SourceSummary>[],
    };
    final selected = store.selectedSource ?? items.firstOrNull;

    return switch (state) {
      FailureViewState<PageResult<SourceSummary>>(:final failure) =>
        AppInlineProblem(
          title: 'Sources unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      EmptyViewState<PageResult<SourceSummary>>() => const AppInlineProblem(
        title: 'No sources',
        message: 'Connect a source to begin collection.',
        tone: AppProblemTone.neutral,
      ),
      PermissionRequiredViewState<PageResult<SourceSummary>>(
        :final permissionKey,
        :final message,
      ) =>
        AppPermissionRepairSurface(
          title: 'Source permission required',
          message: message,
          reasonCode: permissionKey,
          actionLabel: 'Refresh sources',
          onAction: () => unawaited(store.load()),
        ),
      _ => AppResponsiveSplitView(
        list: AppDataList<SourceSummary>(
          items: items,
          isLoading: state is LoadingViewState<PageResult<SourceSummary>>,
          stableId: (source) => source.id.value,
          emptyTitle: 'No sources',
          emptyMessage: 'Connect a source to begin collection.',
          itemBuilder: (context, source, index) {
            return ListTile(
              selected: selected?.id == source.id,
              leading: const Icon(Icons.hub_outlined),
              title: Text(source.name),
              subtitle: Text(source.healthLabel),
              trailing: Wrap(
                spacing: AppSpacing.sm,
                children: [
                  AppStatusBadge(
                    label: _healthLabel(source.credentialHealth),
                    tone: _healthTone(source.credentialHealth),
                  ),
                  if (!source.capability.isEnabled)
                    const AppStatusBadge(
                      label: 'Capability off',
                      tone: AppStatusTone.warning,
                    ),
                ],
              ),
              onTap: () {
                store.selectSource(source.id);
                unawaited(store.loadHealth(source));
              },
            );
          },
        ),
        detailTitle: selected?.name ?? 'Source detail',
        detail: selected == null
            ? const AppInlineProblem(
                title: 'Select a source',
                message: 'Choose a source to review collection health.',
                tone: AppProblemTone.neutral,
              )
            : _SourceDetail(store: store, source: selected),
      ),
    };
  }
}

class _SourceDetail extends StatelessWidget {
  const _SourceDetail({required this.store, required this.source});

  final SourcesCatalogStore store;
  final SourceSummary source;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppEntityHeader(
          title: source.name,
          subtitle:
              'Provider capability, credential health and collection state.',
          status: AppStatusBadge(
            label: _statusLabel(source.collectionStatus),
            tone: source.collectionStatus == SourceCollectionStatus.collecting
                ? AppStatusTone.success
                : AppStatusTone.warning,
          ),
          metadata: [
            AppEntityMetadata(label: 'Health', value: source.healthLabel),
            AppEntityMetadata(
              label: 'Capability',
              value: source.capability.key,
            ),
          ],
          actions: AppCommandBar(
            actions: [
              AppCommandAction(
                label: 'Health',
                icon: Icons.monitor_heart_outlined,
                variant: AppButtonVariant.secondary,
                onPressed: () => unawaited(store.loadHealth(source)),
              ),
              AppCommandAction(
                label: 'Pause',
                icon: Icons.pause_circle_outline,
                variant: AppButtonVariant.secondary,
                onPressed: store.pauseIntentFor(source).isEnabled
                    ? () => unawaited(store.pause(source))
                    : null,
              ),
              AppCommandAction(
                label: 'Resume',
                icon: Icons.play_circle_outline,
                variant: AppButtonVariant.secondary,
                onPressed: store.resumeIntentFor(source).isEnabled
                    ? () => unawaited(store.resume(source))
                    : null,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _HealthSummary(state: store.healthState),
      ],
    );
  }
}

class _HealthSummary extends StatelessWidget {
  const _HealthSummary({required this.state});

  final AsyncViewState<SourceHealthSnapshot> state;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      ReadyViewState<SourceHealthSnapshot>(:final value) => AppInlineProblem(
        title: 'Latest health summary',
        message:
            '${value.summary}. Checked ${value.checkedAtLabel}. Issues: ${value.issueCount}.',
        tone: value.issueCount == 0
            ? AppProblemTone.neutral
            : AppProblemTone.warning,
      ),
      LoadingViewState<SourceHealthSnapshot>() => const AppInlineProblem(
        title: 'Loading health',
        message: 'Checking latest source health.',
        tone: AppProblemTone.neutral,
      ),
      FailureViewState<SourceHealthSnapshot>(:final failure) =>
        AppInlineProblem(
          title: 'Health unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
        ),
      _ => const AppInlineProblem(
        title: 'Health summary',
        message: 'Load latest health before troubleshooting this source.',
        tone: AppProblemTone.neutral,
      ),
    };
  }
}

String _healthLabel(CredentialHealth health) {
  return switch (health) {
    CredentialHealth.healthy => 'Healthy',
    CredentialHealth.expired => 'Needs repair',
    CredentialHealth.disconnected => 'Disconnected',
    CredentialHealth.unknown => 'Unknown',
  };
}

AppStatusTone _healthTone(CredentialHealth health) {
  return switch (health) {
    CredentialHealth.healthy => AppStatusTone.success,
    CredentialHealth.expired ||
    CredentialHealth.disconnected => AppStatusTone.warning,
    CredentialHealth.unknown => AppStatusTone.neutral,
  };
}

String _statusLabel(SourceCollectionStatus status) {
  return switch (status) {
    SourceCollectionStatus.collecting => 'Collecting',
    SourceCollectionStatus.paused => 'Paused',
    SourceCollectionStatus.unknown => 'Unknown',
  };
}
