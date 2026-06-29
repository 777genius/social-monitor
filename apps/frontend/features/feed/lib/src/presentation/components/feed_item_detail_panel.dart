import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import '../formatters/feed_time_formatters.dart';
import '../view_models/feed_provider_visuals.dart';
import 'feed_signal_metric_strip.dart';

class FeedItemDetailPanel extends StatelessWidget {
  const FeedItemDetailPanel({
    super.key,
    required this.item,
    required this.isLoading,
    required this.failure,
  });

  final FeedItem item;
  final bool isLoading;
  final AppFailure? failure;

  @override
  Widget build(BuildContext context) {
    final visuals = feedProviderVisuals(item.providerKey);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _DetailHero(item: item, visuals: visuals),
        if (isLoading) ...[
          const SizedBox(height: AppSpacing.md),
          const AppInlineProblem(
            title: 'Loading detail',
            message: 'Fetching the canonical feed item record.',
            tone: AppProblemTone.neutral,
          ),
        ],
        if (failure != null) ...[
          const SizedBox(height: AppSpacing.md),
          AppInlineProblem(
            title: 'Detail unavailable',
            message: failure!.message,
            tone: AppProblemTone.warning,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        _DetailSection(
          title: 'Summary',
          child: Text(
            '${_providerEvidenceLabel(visuals)} item observed at '
            '${feedDateTimeLabel(item.observedAt)}. ${item.bodyPreview}',
          ),
        ),
        if (item.normalizedSignal != null) ...[
          const SizedBox(height: AppSpacing.md),
          _DetailSection(
            title: 'Importance signal',
            child: FeedSignalMetricStrip(
              signal: item.normalizedSignal,
              metrics: null,
            ),
          ),
        ],
        if (item.providerMetrics != null) ...[
          const SizedBox(height: AppSpacing.md),
          _DetailSection(
            title: 'Source metrics',
            child: FeedSignalMetricStrip(
              signal: null,
              metrics: item.providerMetrics,
            ),
          ),
        ],
        if (item.providerMetadata
            case final GitHubRepositoryTrendMetadata trend) ...[
          const SizedBox(height: AppSpacing.md),
          _RepositoryTrendDetail(trend: trend),
        ],
        const SizedBox(height: AppSpacing.md),
        _DetailSection(title: 'Body preview', child: Text(item.bodyPreview)),
        const SizedBox(height: AppSpacing.md),
        AppInlineProblem(
          title: 'Source link',
          message: item.canonicalUrl,
          tone: AppProblemTone.neutral,
          actionLabel: _canCopyUrl(item.canonicalUrl) ? 'Copy URL' : null,
          onAction: _canCopyUrl(item.canonicalUrl)
              ? () => unawaited(
                  Clipboard.setData(ClipboardData(text: item.canonicalUrl)),
                )
              : null,
        ),
        const SizedBox(height: AppSpacing.md),
        _DetailSection(
          title: 'Provenance',
          child: _DetailRows(
            rows: [
              ('Feed item ID', item.id.value),
              ('Source item ID', item.sourceItemId),
              ('Author', item.authorHandle ?? 'Unknown author'),
              ('Provider', _providerEvidenceLabel(visuals)),
              ('Interest', item.interestId),
              ('Source connection', item.sourceBindingId),
              ('Published', feedDateTimeLabel(item.publishedAt)),
              ('Observed', feedDateTimeLabel(item.observedAt)),
            ],
          ),
        ),
      ],
    );
  }
}

String _providerEvidenceLabel(FeedProviderVisuals visuals) =>
    visuals.originLabel == null
    ? visuals.label
    : '${visuals.label} - ${visuals.originLabel}';

class _RepositoryTrendDetail extends StatelessWidget {
  const _RepositoryTrendDetail({required this.trend});

  final GitHubRepositoryTrendMetadata trend;

  @override
  Widget build(BuildContext context) {
    return _DetailSection(
      title: 'Repository trend',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            trend.description ?? 'No repository description available.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _DetailRows(
            rows: [
              ('Repository', trend.repositoryFullName),
              ('Rank', '#${trend.rank}'),
              ('Primary window', trend.primaryWindow),
              if (trend.language != null) ('Language', trend.language!),
              if (trend.license != null) ('License', trend.license!),
              if (trend.checkedAt != null)
                ('Checked', feedDateTimeLabel(trend.checkedAt!)),
              ('Evidence source', 'GH Archive WatchEvent'),
              ('Freshness', 'GH Archive BigQuery can lag by about an hour'),
              ('Backend source', trend.source),
            ],
          ),
          if (trend.topics.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: trend.topics
                  .take(5)
                  .map(
                    (topic) => AppStatusBadge(
                      label: topic,
                      tone: AppStatusTone.neutral,
                    ),
                  )
                  .toList(growable: false),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailHero extends StatelessWidget {
  const _DetailHero({required this.item, required this.visuals});

  final FeedItem item;
  final FeedProviderVisuals visuals;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: visuals.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    child: Icon(visuals.icon, color: visuals.accent, size: 20),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppStatusBadge(label: visuals.label, tone: visuals.tone),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              item.title,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
                height: 1.2,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              item.authorHandle ?? 'Unknown author',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailSection extends StatelessWidget {
  const _DetailSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(
          color: dark ? AppColors.darkBorder : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: DefaultTextStyle.merge(
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
            height: 1.4,
            letterSpacing: 0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRows extends StatelessWidget {
  const _DetailRows({required this.rows});

  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: rows
          .map((row) => _DetailRow(label: row.$1, value: row.$2))
          .toList(growable: false),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                letterSpacing: 0,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

bool _canCopyUrl(String value) {
  final uri = Uri.tryParse(value);
  return uri != null &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty;
}
