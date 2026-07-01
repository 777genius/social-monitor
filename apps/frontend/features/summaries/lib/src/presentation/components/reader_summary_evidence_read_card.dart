part of 'reader_summary_brief_surface.dart';

class _ReadCard extends StatelessWidget {
  const _ReadCard({
    super.key,
    required this.readIndex,
    required this.keyPrefix,
    required this.read,
    required this.showDivider,
    required this.showReason,
    required this.showCitationSnippet,
    required this.showLeadingRank,
    required this.showInsightLabels,
    required this.showSelectionReasons,
    required this.compact,
    required this.featured,
    required this.citations,
    required this.onOpenUrl,
  });

  final int readIndex;
  final String keyPrefix;
  final TopRead read;
  final bool showDivider;
  final bool showReason;
  final bool showCitationSnippet;
  final bool showLeadingRank;
  final bool showInsightLabels;
  final bool showSelectionReasons;
  final bool compact;
  final bool featured;
  final List<SummaryCitation> citations;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = read.canonicalUrl;
    final previewMedia = read.previewMedia;
    final citationSnippet = !showCitationSnippet || citations.isEmpty
        ? null
        : _citationSnippet(citations.first);
    final includeRankMetric = !showLeadingRank;
    final hasMetricBadges = _metricBadgesFor(
      read,
      includeRank: includeRankMetric,
    ).isNotEmpty;
    final contentPadding = compact
        ? const EdgeInsets.all(AppSpacing.sm)
        : featured
        ? const EdgeInsets.fromLTRB(
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.md,
          )
        : const EdgeInsets.only(bottom: AppSpacing.md);
    final body = Padding(
      padding: contentPadding,
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.only(top: previewMedia == null ? 2 : 0),
                child: previewMedia != null
                    ? ReaderSummaryPreviewMedia(
                        media: previewMedia,
                        compact: compact || !featured,
                      )
                    : showLeadingRank
                    ? _ReadRankBadge(rank: readIndex + 1)
                    : _ReadSourceIcon(read: read),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _ReadTextBlock(
                      label: null,
                      child: InkWell(
                        onTap: url == null ? null : () => onOpenUrl(url),
                        child: Text(
                          read.title,
                          maxLines: compact ? 1 : (featured ? 3 : 2),
                          overflow: TextOverflow.ellipsis,
                          style:
                              (featured
                                      ? Theme.of(context).textTheme.titleMedium
                                      : Theme.of(context).textTheme.titleSmall)
                                  ?.copyWith(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.primary,
                                    fontWeight: FontWeight.w900,
                                    decoration: TextDecoration.underline,
                                    letterSpacing: 0,
                                  ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        AppStatusBadge(
                          label: readerSummaryProviderLabel(read.providerKey),
                          tone: AppStatusTone.neutral,
                        ),
                        if (url != null && url.trim().isNotEmpty) ...[
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: KeyedSubtree(
                              key: ValueKey('$keyPrefix-$readIndex-url'),
                              child: ReaderSummaryExternalLink(
                                url: url,
                                onOpenUrl: onOpenUrl,
                                maxLines: 1,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (featured && hasMetricBadges) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _ReadMetricBadges(
                        read: read,
                        includeRank: includeRankMetric,
                      ),
                    ],
                    if (showReason) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _ReadTextBlock(
                        label: showInsightLabels && featured
                            ? 'Why it matters'
                            : null,
                        child: Text(
                          readerSummaryDisplayReason(read),
                          maxLines: compact ? 1 : (featured ? 3 : 2),
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                height: 1.45,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ),
                    ],
                    if (showSelectionReasons) ...[
                      const SizedBox(height: AppSpacing.xs),
                      _SelectionReasonBadges(read: read),
                    ],
                    if (!featured && hasMetricBadges) ...[
                      const SizedBox(height: AppSpacing.xs),
                      _ReadMetricBadges(
                        read: read,
                        includeRank: includeRankMetric,
                      ),
                    ],
                    if (citationSnippet != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        citationSnippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (showDivider && !featured) ...[
            const SizedBox(height: AppSpacing.md),
            Divider(
              height: 1,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ],
        ],
      ),
    );
    if (!compact) {
      if (!featured) {
        return body;
      }
      final colorScheme = Theme.of(context).colorScheme;
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: colorScheme.primary.withValues(alpha: 0.7),
                width: 3,
              ),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.only(left: AppSpacing.sm),
            child: body,
          ),
        ),
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: body,
    );
  }
}

class _ReadTextBlock extends StatelessWidget {
  const _ReadTextBlock({required this.child, this.label});

  final String? label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final label = this.label;
    if (label == null) {
      return child;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 2),
        child,
      ],
    );
  }
}

class _SelectionReasonBadges extends StatelessWidget {
  const _SelectionReasonBadges({required this.read});

  final TopRead read;

  @override
  Widget build(BuildContext context) {
    final badges = _selectionReasonBadgesFor(read);
    if (badges.isEmpty) {
      return const SizedBox.shrink();
    }
    return Tooltip(
      message: 'Ranking signals',
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [for (final badge in badges) _MetricBadge(data: badge)],
      ),
    );
  }
}

List<_MetricBadgeData> _selectionReasonBadgesFor(TopRead read) {
  final badges = <_MetricBadgeData>[];
  if (_hasHighEngagement(read)) {
    badges.add(
      const _MetricBadgeData(
        icon: Icons.local_fire_department_outlined,
        label: 'high engagement',
      ),
    );
  }
  if (_hasCrossSourceSupport(read)) {
    badges.add(
      const _MetricBadgeData(icon: Icons.hub_outlined, label: 'cross-source'),
    );
  }
  if (_isFreshSignal(read)) {
    badges.add(
      const _MetricBadgeData(icon: Icons.today_outlined, label: 'fresh today'),
    );
  }
  if (_hasTopicMatch(read)) {
    badges.add(
      const _MetricBadgeData(
        icon: Icons.track_changes_outlined,
        label: 'topic match',
      ),
    );
  }
  return _uniqueBadgeLabels(badges).take(3).toList(growable: false);
}

bool _hasHighEngagement(TopRead read) {
  final text = _readEvidenceText(read);
  return text.contains('like') ||
      text.contains('repost') ||
      text.contains('reply') ||
      text.contains('comment') ||
      text.contains('score') ||
      text.contains('point') ||
      text.contains('star') ||
      text.contains('upvoted');
}

bool _hasCrossSourceSupport(TopRead read) {
  return read.confirmedProviderKeys
          .where((providerKey) => providerKey.trim().isNotEmpty)
          .toSet()
          .length >
      1;
}

bool _isFreshSignal(TopRead read) {
  final text = _readEvidenceText(read);
  return text.contains('today') ||
      text.contains('fresh') ||
      text.contains('current summary window');
}

bool _hasTopicMatch(TopRead read) {
  final hasInterestMatch = read.matchedInterestIds.any(
    (interestId) => interestId.trim().isNotEmpty,
  );
  final hasRuleMatch = read.matchedRules.any((rule) {
    final lower = rule.toLowerCase();
    return lower.contains('topic') || lower.contains('interest');
  });
  return hasInterestMatch || hasRuleMatch;
}

String _readEvidenceText(TopRead read) {
  return [
    read.reason,
    read.whyNow,
    ...read.whyImportant,
    ...read.providerMetrics.map(_providerMetricSummary),
  ].join(' ').toLowerCase();
}

List<_MetricBadgeData> _uniqueBadgeLabels(List<_MetricBadgeData> badges) {
  final seen = <String>{};
  final result = <_MetricBadgeData>[];
  for (final badge in badges) {
    if (!seen.add(badge.label)) {
      continue;
    }
    result.add(badge);
  }
  return result;
}

class _ReadSourceIcon extends StatelessWidget {
  const _ReadSourceIcon({required this.read});

  final TopRead read;

  @override
  Widget build(BuildContext context) {
    if (_isGithub(read)) {
      return const GitHubMark(size: 18);
    }
    return const Icon(Icons.article_outlined, size: 18);
  }
}
