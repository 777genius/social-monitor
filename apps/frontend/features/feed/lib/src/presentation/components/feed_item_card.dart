import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import '../../domain/value_objects/feed_signal_snapshot.dart';
import '../formatters/feed_time_formatters.dart';
import '../view_models/feed_provider_visuals.dart';
import 'feed_signal_metric_strip.dart';

class FeedItemCard extends StatelessWidget {
  const FeedItemCard({
    super.key,
    required this.item,
    required this.index,
    required this.onTap,
  });

  final FeedItem item;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final stripeColor = colorScheme.surfaceContainerHighest.withValues(
      alpha: 0.14,
    );
    return Material(
      key: ValueKey('feed-item-row-${item.id.value}'),
      color: index.isOdd ? stripeColor : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        hoverColor: colorScheme.primary.withValues(alpha: 0.03),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: _FeedItemRow(item: item),
        ),
      ),
    );
  }
}

class _FeedItemRow extends StatelessWidget {
  const _FeedItemRow({required this.item});

  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 980;
        final source = _FeedItemSourceColumn(item: item);
        final content = _FeedItemContentColumn(item: item);
        final metrics = FeedSignalMetricStrip(
          signal: item.normalizedSignal,
          metrics: item.providerMetrics,
          dense: true,
        );
        final signal = _FeedItemSignalColumn(signal: item.normalizedSignal);

        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 190, child: source),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: content),
              const SizedBox(width: AppSpacing.md),
              SizedBox(width: 310, child: metrics),
              const SizedBox(width: AppSpacing.md),
              SizedBox(width: 128, child: signal),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: source),
                const SizedBox(width: AppSpacing.sm),
                Flexible(child: signal),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            content,
            if (item.normalizedSignal != null ||
                item.providerMetrics != null) ...[
              const SizedBox(height: AppSpacing.sm),
              metrics,
            ],
          ],
        );
      },
    );
  }
}

class _FeedItemSourceColumn extends StatelessWidget {
  const _FeedItemSourceColumn({required this.item});

  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    final visuals = feedProviderVisuals(item.providerKey);
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ProviderTile(providerKey: item.providerKey),
        const SizedBox(width: AppSpacing.sm + 4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                visuals.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              if (item.authorHandle != null) ...[
                const SizedBox(height: 2),
                Text(
                  item.authorHandle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: item.authorHandle!.startsWith('@')
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ],
              if (visuals.originLabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  visuals.originLabel!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
              ],
              const SizedBox(height: 2),
              Text(
                feedShortTimeLabel(item.observedAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.labelSmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProviderTile extends StatelessWidget {
  const _ProviderTile({required this.providerKey});

  final String providerKey;

  @override
  Widget build(BuildContext context) {
    final normalized = providerKey.trim().toLowerCase();
    final isDarkTile =
        normalized == 'x-twitter' ||
        normalized == 'twitter' ||
        normalized.startsWith('github');
    if (!isDarkTile) {
      return SizedBox.square(
        dimension: 34,
        child: Center(
          child: AppProviderLogo(providerKey: providerKey, size: 30),
        ),
      );
    }
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.chartInk,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SizedBox.square(
        dimension: 34,
        child: Center(
          child: Theme(
            data: theme.copyWith(
              colorScheme: theme.colorScheme.copyWith(onSurface: Colors.white),
            ),
            child: AppProviderLogo(providerKey: providerKey, size: 22),
          ),
        ),
      ),
    );
  }
}

class _FeedItemContentColumn extends StatelessWidget {
  const _FeedItemContentColumn({required this.item});

  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final tags = _tagsFor(item);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          item.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
            height: 1.3,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          item.bodyPreview,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyMedium?.copyWith(
            color: colorScheme.onSurfaceVariant,
            height: 1.4,
            letterSpacing: 0,
          ),
        ),
        if (tags.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs + 2,
            runSpacing: AppSpacing.xs + 2,
            children: [
              for (final tag in tags)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHighest.withValues(
                      alpha: 0.55,
                    ),
                    border: Border.all(color: colorScheme.outlineVariant),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm + 2,
                      vertical: 3,
                    ),
                    child: Text(
                      tag,
                      style: textTheme.labelSmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _FeedItemSignalColumn extends StatelessWidget {
  const _FeedItemSignalColumn({required this.signal});

  final FeedSignalSnapshot? signal;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final band = signal?.band;
    final (label, background, foreground, icon) = switch (band) {
      FeedSignalBand.breakout => (
        'Breakout',
        AppColors.successSurface,
        AppColors.success,
        Icons.trending_up_rounded,
      ),
      FeedSignalBand.high => (
        'High signal',
        AppColors.successSurface,
        AppColors.success,
        Icons.north_east_rounded,
      ),
      FeedSignalBand.normal => (
        'Normal signal',
        colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        colorScheme.onSurfaceVariant,
        Icons.show_chart_rounded,
      ),
      FeedSignalBand.low || FeedSignalBand.noSignal => (
        'Low signal',
        colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        colorScheme.onSurfaceVariant,
        Icons.trending_flat_rounded,
      ),
      FeedSignalBand.unknown || null => (
        'No signal',
        colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        colorScheme.onSurfaceVariant,
        Icons.radio_button_unchecked_rounded,
      ),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm + 2,
              vertical: AppSpacing.xs + 1,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 13, color: foreground),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.labelSmall?.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (signal != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Signal ${signal!.score}',
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
        ],
      ],
    );
  }
}

List<String> _tagsFor(FeedItem item) {
  final trend = item.providerMetadata;
  if (trend is GitHubRepositoryTrendMetadata) {
    return [
      if (trend.language != null) trend.language!,
      ...trend.topics,
    ].take(3).toList(growable: false);
  }
  return const <String>[];
}
