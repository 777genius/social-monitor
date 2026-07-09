import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

enum ReaderSummaryTopicDecisionIconButtonTone { accept, reject, neutral }

class ReaderSummaryTopicDecisionIconButton extends StatelessWidget {
  const ReaderSummaryTopicDecisionIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.tone,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final ReaderSummaryTopicDecisionIconButtonTone tone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final foreground = switch (tone) {
      ReaderSummaryTopicDecisionIconButtonTone.accept => AppColors.success,
      ReaderSummaryTopicDecisionIconButtonTone.reject => colorScheme.error,
      ReaderSummaryTopicDecisionIconButtonTone.neutral =>
        colorScheme.onSurfaceVariant,
    };

    return IconButton.filledTonal(
      tooltip: tooltip,
      style: IconButton.styleFrom(
        fixedSize: const Size.square(32),
        minimumSize: const Size.square(32),
        padding: EdgeInsets.zero,
        backgroundColor: foreground.withValues(alpha: 0.12),
        foregroundColor: foreground,
        hoverColor: foreground.withValues(alpha: 0.16),
        focusColor: foreground.withValues(alpha: 0.18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: foreground.withValues(alpha: 0.22)),
        ),
      ),
      icon: Icon(icon, size: 17),
      onPressed: onPressed,
    );
  }
}
