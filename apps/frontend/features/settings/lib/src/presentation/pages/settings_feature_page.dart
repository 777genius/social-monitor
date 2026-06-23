import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/diagnostic_snapshot.dart';
import '../../domain/entities/workspace_settings.dart';
import '../../domain/value_objects/digest_frequency.dart';
import '../../domain/value_objects/telemetry_consent_state.dart';
import '../stores/workspace_settings_store.dart';

class SettingsFeaturePage extends StatefulWidget {
  const SettingsFeaturePage({
    super.key,
    required this.store,
    this.autoload = true,
  });

  final WorkspaceSettingsStore store;
  final bool autoload;

  @override
  State<SettingsFeaturePage> createState() => _SettingsFeaturePageState();
}

class _SettingsFeaturePageState extends State<SettingsFeaturePage> {
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
                  eyebrow: 'Control',
                  title: 'Settings and workspace governance',
                  description:
                      'Manage workspace controls, support diagnostics and privacy-safe telemetry choices.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _SettingsBody(store: widget.store),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SettingsBody extends StatelessWidget {
  const _SettingsBody({required this.store});

  final WorkspaceSettingsStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final readySettings = switch (state) {
      ReadyViewState<WorkspaceSettings>(:final value) => value,
      LoadingViewState<WorkspaceSettings>(:final previousValue) =>
        previousValue,
      _ => null,
    };

    return switch (state) {
      LoadingViewState<WorkspaceSettings>(:final previousValue)
          when previousValue == null =>
        const Center(child: CircularProgressIndicator()),
      FailureViewState<WorkspaceSettings>(:final failure) => AppInlineProblem(
        title: 'Settings unavailable',
        message: failure.message,
        tone: AppProblemTone.warning,
        actionLabel: 'Retry',
        onAction: () => unawaited(store.load()),
      ),
      PermissionRequiredViewState<WorkspaceSettings>(
        :final permissionKey,
        :final message,
      ) =>
        AppPermissionRepairSurface(
          title: 'Settings permission required',
          message: message,
          reasonCode: permissionKey,
          actionLabel: 'Refresh settings',
          onAction: () => unawaited(store.load()),
        ),
      _ when readySettings != null => _ReadySettings(
        store: store,
        settings: readySettings,
      ),
      _ => const AppInlineProblem(
        title: 'Settings unavailable',
        message: 'Workspace settings are not ready yet.',
        tone: AppProblemTone.neutral,
      ),
    };
  }
}

class _ReadySettings extends StatelessWidget {
  const _ReadySettings({required this.store, required this.settings});

  final WorkspaceSettingsStore store;
  final WorkspaceSettings settings;

  @override
  Widget build(BuildContext context) {
    final rows = [
      _SettingsRow(
        label: 'Digest preference',
        value: _digestLabel(settings.digestFrequency),
      ),
      _SettingsRow(
        label: 'Telemetry consent',
        value: _consentLabel(settings.telemetryConsent),
      ),
      _SettingsRow(label: 'Workspace role', value: settings.workspaceRole),
      _SettingsRow(label: 'Trace', value: settings.diagnostics.traceId),
    ];
    final copyState = store.diagnosticsCopyState;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppInlineProblem(
          title: 'Support-safe diagnostics',
          message:
              'Diagnostics expose route id, release version, feature snapshot and correlation id without provider payloads.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<_SettingsRow>(
          items: rows,
          stableId: (row) => row.label,
          emptyTitle: 'No settings',
          emptyMessage: 'Workspace settings will appear after bootstrap.',
          itemBuilder: (context, row, index) {
            return ListTile(
              leading: const Icon(Icons.tune_outlined),
              title: Text(row.label),
              subtitle: Text(row.value),
            );
          },
        ),
        const SizedBox(height: AppSpacing.md),
        AppCommandBar(
          actions: [
            AppCommandAction(
              label: 'Daily',
              icon: Icons.calendar_today_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () =>
                  unawaited(store.updateDigest(DigestFrequency.daily)),
            ),
            AppCommandAction(
              label: 'Weekly',
              icon: Icons.date_range_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () =>
                  unawaited(store.updateDigest(DigestFrequency.weekly)),
            ),
            AppCommandAction(
              label: 'Enable telemetry',
              icon: Icons.visibility_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => unawaited(
                store.updateTelemetry(TelemetryConsentState.enabled),
              ),
            ),
            AppCommandAction(
              label: 'Disable telemetry',
              icon: Icons.visibility_off_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => unawaited(
                store.updateTelemetry(TelemetryConsentState.disabled),
              ),
            ),
            AppCommandAction(
              label: 'Copy diagnostics',
              icon: Icons.copy,
              onPressed: () => store.prepareDiagnosticsCopy(settings),
            ),
          ],
        ),
        if (copyState is ReadyViewState<DiagnosticSnapshot>) ...[
          const SizedBox(height: AppSpacing.md),
          AppInlineProblem(
            title: 'Diagnostics ready to copy',
            message: copyState.value.safeCopyText,
            tone: AppProblemTone.neutral,
          ),
        ],
      ],
    );
  }
}

final class _SettingsRow {
  const _SettingsRow({required this.label, required this.value});

  final String label;
  final String value;
}

String _digestLabel(DigestFrequency frequency) {
  return switch (frequency) {
    DigestFrequency.off => 'Off',
    DigestFrequency.daily => 'Daily',
    DigestFrequency.weekly => 'Weekly',
    DigestFrequency.unknown => 'Unknown',
  };
}

String _consentLabel(TelemetryConsentState consent) {
  return switch (consent) {
    TelemetryConsentState.enabled => 'Enabled',
    TelemetryConsentState.disabled => 'Disabled',
    TelemetryConsentState.notConfigured => 'Not configured',
    TelemetryConsentState.unknown => 'Unknown',
  };
}
