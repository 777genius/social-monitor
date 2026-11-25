import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/feed_item.dart';
import '../formatters/feed_time_formatters.dart';
import '../view_models/feed_provider_visuals.dart';

class FeedCompactSignal extends StatelessWidget {
  const FeedCompactSignal({super.key, required this.item});

  final FeedItem? item;

  @override
  Widget build(BuildContext context) {
    if (item == null) {
      return const SizedBox.shrink();
    }
    final visuals = feedProviderVisuals(item!.providerKey);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Row(
          children: [
            Icon(visuals.icon, color: visuals.accent, size: 18),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                item!.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class FeedSnapshotSignalRow extends StatelessWidget {
  const FeedSnapshotSignalRow({super.key, required this.item});

  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    final visuals = feedProviderVisuals(item.providerKey);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(visuals.icon, color: visuals.accent, size: 18),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0,
                  ),
                ),
                Text(
                  '${visuals.label} - ${feedShortTimeLabel(item.observedAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
