import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../formatters/summary_export_text.dart';
import 'workspace_summary_period_toolbar.dart';

/// Wraps summary content with the period toolbar (navigation, presets,
/// regenerate and export actions).
class WorkspaceSummaryPeriodShell extends StatelessWidget {
  const WorkspaceSummaryPeriodShell({
    super.key,
    required this.selectedPeriod,
    required this.selectedPreset,
    required this.availableSummaryPeriods,
    required this.canNavigateToPreviousPeriod,
    required this.canNavigateToNextPeriod,
    required this.onPeriodChanged,
    required this.onPreviousPeriod,
    required this.onNextPeriod,
    required this.onCalendarDateSelected,
    this.onGenerate,
    required this.isGenerating,
    required this.exportSummary,
    required this.child,
    this.contentPadding = const EdgeInsets.only(top: AppSpacing.md),
  });

  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> availableSummaryPeriods;
  final bool canNavigateToPreviousPeriod;
  final bool canNavigateToNextPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onNextPeriod;
  final ValueChanged<DateTime> onCalendarDateSelected;
  final VoidCallback? onGenerate;
  final bool isGenerating;
  final ReaderSummary? exportSummary;
  final Widget child;
  final EdgeInsets contentPadding;

  @override
  Widget build(BuildContext context) {
    final summary = exportSummary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _WorkspaceSummaryHeaderBand(
          child: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: selectedPeriod,
            selectedPreset: selectedPreset,
            availableSummaryPeriods: availableSummaryPeriods,
            canNavigateToPreviousPeriod: canNavigateToPreviousPeriod,
            canNavigateToNextPeriod: canNavigateToNextPeriod,
            onPeriodChanged: onPeriodChanged,
            onPreviousPeriod: onPreviousPeriod,
            onNextPeriod: onNextPeriod,
            onCalendarDateSelected: onCalendarDateSelected,
            onGenerate: onGenerate,
            isGenerating: isGenerating,
            onExport: summary == null
                ? null
                : () => _exportSummary(context, summary),
            collectionStatsSummary: summary,
          ),
        ),
        Padding(padding: contentPadding, child: child),
      ],
    );
  }

  Future<void> _exportSummary(
    BuildContext context,
    ReaderSummary summary,
  ) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    await Clipboard.setData(
      ClipboardData(text: buildSummaryExportText(summary)),
    );
    messenger?.showSnackBar(
      const SnackBar(content: Text('Summary copied to clipboard')),
    );
  }
}

class _WorkspaceSummaryHeaderBand extends StatelessWidget {
  const _WorkspaceSummaryHeaderBand({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      key: const ValueKey('workspace-summary-header-band'),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        border: Border.symmetric(
          horizontal: BorderSide(color: colorScheme.outlineVariant),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: child,
      ),
    );
  }
}
