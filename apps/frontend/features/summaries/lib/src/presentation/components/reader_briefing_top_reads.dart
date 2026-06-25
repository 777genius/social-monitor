import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/generated_briefing.dart';
import '../../domain/entities/summary_citation.dart';
import 'github_mark.dart';
import 'reader_briefing_provider_label.dart';
import 'reader_briefing_sections.dart';

class ReaderBriefingTopReads extends StatelessWidget {
  const ReaderBriefingTopReads({
    super.key,
    required this.items,
    required this.citationsById,
  });

  final List<BriefingReaderItem> items;
  final Map<String, SummaryCitation> citationsById;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'Top reads',
      icon: Icons.open_in_new_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            key: const ValueKey('reader-brief-top-read-count'),
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              'Showing ${items.length} top reads',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ),
          ...items.indexed.map(
            (entry) => _TopReadRow(
              index: entry.$1,
              item: entry.$2,
              citations: entry.$2.citationIds
                  .map((citationId) => citationsById[citationId])
                  .whereType<SummaryCitation>()
                  .toList(growable: false),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopReadRow extends StatelessWidget {
  const _TopReadRow({
    required this.index,
    required this.item,
    required this.citations,
  });

  final int index;
  final BriefingReaderItem item;
  final List<SummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    final isGithub = _isGithub(item);
    return Padding(
      key: ValueKey('reader-brief-top-read-$index'),
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 520;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: isGithub
                        ? const GitHubMark(size: 18)
                        : const Icon(Icons.article_outlined, size: 18),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          maxLines: compact ? 2 : 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0,
                              ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Wrap(
                          spacing: AppSpacing.xs,
                          runSpacing: AppSpacing.xs,
                          children: [
                            AppStatusBadge(
                              label: readerBriefingProviderLabel(
                                item.providerKey,
                              ),
                              tone: AppStatusTone.neutral,
                            ),
                            AppStatusBadge(
                              label:
                                  'Score ${item.signalScore.toStringAsFixed(2)}',
                              tone: AppStatusTone.neutral,
                            ),
                            if (citations.length > 1)
                              AppStatusBadge(
                                label: '${citations.length} citations',
                                tone: AppStatusTone.success,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (compact)
                    TextButton.icon(
                      key: ValueKey('reader-brief-top-read-$index-details'),
                      onPressed: () => _showDetails(context),
                      icon: const Icon(Icons.notes_outlined, size: 18),
                      label: const Text('Details'),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                item.reason,
                maxLines: compact ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (!compact) ...[
                const SizedBox(height: AppSpacing.xs),
                _TopReadDetails(index: index, item: item, citations: citations),
              ],
              if (compact && item.canonicalUrl != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  item.canonicalUrl!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  void _showDetails(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.md,
          ),
          child: SingleChildScrollView(
            child: _TopReadDetails(
              index: index,
              item: item,
              citations: citations,
            ),
          ),
        ),
      ),
    );
  }
}

class _TopReadDetails extends StatelessWidget {
  const _TopReadDetails({
    required this.index,
    required this.item,
    required this.citations,
  });

  final int index;
  final BriefingReaderItem item;
  final List<SummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          item.whyNow,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        if (item.whyImportant.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _InlineLabelList(
            label: 'Why this matters',
            values: item.whyImportant.take(3).toList(),
          ),
        ],
        if (item.providerMetrics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: item.providerMetrics
                .map(
                  (metric) => AppStatusBadge(
                    label: '${metric.label}: ${metric.value}',
                    tone: AppStatusTone.neutral,
                  ),
                )
                .toList(growable: false),
          ),
        ],
        if (item.matchedTopicIds.isNotEmpty ||
            item.matchedRules.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              ...item.matchedTopicIds
                  .take(2)
                  .map(
                    (topicId) => AppStatusBadge(
                      label: topicId,
                      tone: AppStatusTone.neutral,
                    ),
                  ),
              ...item.matchedRules
                  .take(2)
                  .map(
                    (rule) => AppStatusBadge(
                      label: rule,
                      tone: AppStatusTone.neutral,
                    ),
                  ),
            ],
          ),
        ],
        if (item.canonicalUrl != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            item.canonicalUrl!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
        ],
        if (citations.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _CitationDisclosure(index: index, citations: citations),
        ],
      ],
    );
  }
}

class _InlineLabelList extends StatelessWidget {
  const _InlineLabelList({required this.label, required this.values});

  final String label;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 2),
        ...values.map(
          (value) => Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _CitationDisclosure extends StatelessWidget {
  const _CitationDisclosure({required this.index, required this.citations});

  final int index;
  final List<SummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: ValueKey('reader-brief-top-read-$index-citations'),
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(
          'Citations (${citations.length})',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        children: citations
            .map(
              (citation) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      citation.sourceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                    Text(
                      citation.safeSnippet,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (citation.canonicalUrl != null)
                      Text(
                        citation.canonicalUrl!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0,
                        ),
                      ),
                  ],
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

bool _isGithub(BriefingReaderItem item) {
  final uri = Uri.tryParse(item.canonicalUrl ?? '');
  return item.providerKey == 'github-repo-radar' ||
      item.providerKey == 'github-trending-page' ||
      uri?.host.toLowerCase() == 'github.com';
}
