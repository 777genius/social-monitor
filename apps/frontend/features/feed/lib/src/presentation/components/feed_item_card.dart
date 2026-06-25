import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import '../formatters/feed_time_formatters.dart';
import '../view_models/feed_provider_visuals.dart';
import 'feed_signal_metric_strip.dart';

class FeedItemCard extends StatelessWidget {
  const FeedItemCard({
    super.key,
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final FeedItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final visuals = feedProviderVisuals(item.providerKey);
    final colorScheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final borderColor = selected
        ? colorScheme.primary
        : dark
        ? AppColors.darkBorder
        : AppColors.border;
    final background = selected
        ? colorScheme.primary.withValues(alpha: dark ? 0.16 : 0.06)
        : colorScheme.surface;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: background,
              border: Border.all(color: borderColor),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CardTopLine(item: item, visuals: visuals),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      height: 1.25,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    item.bodyPreview,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: dark
                          ? AppColors.darkTextMuted
                          : AppColors.textMuted,
                      height: 1.35,
                      letterSpacing: 0,
                    ),
                  ),
                  if (item.normalizedSignal != null ||
                      item.providerMetrics != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    FeedSignalMetricStrip(
                      signal: item.normalizedSignal,
                      metrics: item.providerMetrics,
                      dense: true,
                    ),
                  ],
                  if (item.providerMetadata
                      case final GitHubRepositoryTrendMetadata trend) ...[
                    const SizedBox(height: AppSpacing.md),
                    _RepositoryTrendStrip(trend: trend),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      _MetaChip(
                        icon: Icons.account_circle_outlined,
                        label: item.authorHandle ?? 'Unknown author',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RepositoryTrendStrip extends StatelessWidget {
  const _RepositoryTrendStrip({required this.trend});

  final GitHubRepositoryTrendMetadata trend;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        _MetaChip(icon: Icons.tag_outlined, label: '#${trend.rank}'),
        if (trend.language != null)
          _MetaChip(icon: Icons.code, label: trend.language!),
      ],
    );
  }
}

class _CardTopLine extends StatelessWidget {
  const _CardTopLine({required this.item, required this.visuals});

  final FeedItem item;
  final FeedProviderVisuals visuals;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        _ProviderMark(visuals: visuals),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            [
              visuals.label,
              if (visuals.originLabel != null) visuals.originLabel!,
            ].join(' - '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          feedShortTimeLabel(item.observedAt),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

class _ProviderMark extends StatelessWidget {
  const _ProviderMark({required this.visuals});

  final FeedProviderVisuals visuals;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: visuals.accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Icon(visuals.icon, color: visuals.accent, size: 18),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 14,
              color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
            ),
            const SizedBox(width: AppSpacing.xs),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 180),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                  fontWeight: FontWeight.w700,
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
