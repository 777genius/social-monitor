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
    required this.isCurrentPeriod,
    required this.onPeriodChanged,
    required this.onPreviousPeriod,
    required this.onCurrentPeriod,
    required this.onNextPeriod,
    required this.onCalendarDateSelected,
    required this.onGenerate,
    required this.isGenerating,
    required this.exportSummary,
    required this.child,
  });

  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPreset;
  final List<SummaryPeriod> availableSummaryPeriods;
  final bool canNavigateToPreviousPeriod;
  final bool canNavigateToNextPeriod;
  final bool isCurrentPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onCurrentPeriod;
  final VoidCallback onNextPeriod;
  final ValueChanged<DateTime> onCalendarDateSelected;
  final VoidCallback onGenerate;
  final bool isGenerating;
  final ReaderSummary? exportSummary;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final summary = exportSummary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WorkspaceSummaryPeriodToolbar(
          selectedPeriod: selectedPeriod,
          selectedPreset: selectedPreset,
          availableSummaryPeriods: availableSummaryPeriods,
          canNavigateToPreviousPeriod: canNavigateToPreviousPeriod,
          canNavigateToNextPeriod: canNavigateToNextPeriod,
          isCurrentPeriod: isCurrentPeriod,
          onPeriodChanged: onPeriodChanged,
          onPreviousPeriod: onPreviousPeriod,
          onCurrentPeriod: onCurrentPeriod,
          onNextPeriod: onNextPeriod,
          onCalendarDateSelected: onCalendarDateSelected,
          onGenerate: onGenerate,
          isGenerating: isGenerating,
          onExport: summary == null
              ? null
              : () => _exportSummary(context, summary),
          collectionStatsSummary: summary,
        ),
        const SizedBox(height: AppSpacing.md),
        child,
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
