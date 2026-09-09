import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/reader_captured_source.dart';

class ReaderSummaryCapturedSource extends StatefulWidget {
  const ReaderSummaryCapturedSource({super.key, this.source, this.historicalText});
  final ReaderCapturedSource? source;
  final String? historicalText;

  @override
  State<ReaderSummaryCapturedSource> createState() => _CapturedSourceState();
}

class _CapturedSourceState extends State<ReaderSummaryCapturedSource> {
  bool _expanded = false;

  @override
  void didUpdateWidget(covariant ReaderSummaryCapturedSource oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.source != widget.source ||
        oldWidget.historicalText != widget.historicalText) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final source = widget.source;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (source == null)
          const Text('Historical source presentation; headline not assessed.')
        else if (source.captureAvailability == ReaderCaptureAvailability.unavailable)
          const Text('Captured body unavailable.')
        else if (source.reviewAvailability == ReaderSourceReviewAvailability.titleOnly)
          const Text('Only the source title was available for review.')
        else if (source.reviewAvailability == ReaderSourceReviewAvailability.unavailable)
          const Text('Source review unavailable.'),
        Semantics(
          expanded: _expanded,
          child: AppButton(
            label: _expanded ? 'Hide captured source' : 'Captured source',
            variant: AppButtonVariant.text,
            onPressed: () => setState(() => _expanded = !_expanded),
          ),
        ),
        if (_expanded) ...[
          SelectableText(source?.title ?? widget.historicalText ?? ''),
          if (source?.body case final String body) ...[
            const SizedBox(height: AppSpacing.sm),
            SelectableText(body),
          ],
        ],
      ],
    );
  }
}
