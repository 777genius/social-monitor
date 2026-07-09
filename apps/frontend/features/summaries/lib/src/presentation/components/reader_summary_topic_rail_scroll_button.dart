import 'package:flutter/material.dart';

class ReaderSummaryTopicRailScrollButton extends StatelessWidget {
  const ReaderSummaryTopicRailScrollButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      color: colorScheme.surface.withValues(alpha: 0.94),
      elevation: 3,
      shadowColor: colorScheme.shadow.withValues(alpha: 0.18),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: IconButton(
        tooltip: tooltip,
        constraints: const BoxConstraints.tightFor(width: 36, height: 44),
        padding: EdgeInsets.zero,
        color: colorScheme.onSurfaceVariant,
        icon: Icon(icon, size: 22),
        onPressed: onPressed,
      ),
    );
  }
}
