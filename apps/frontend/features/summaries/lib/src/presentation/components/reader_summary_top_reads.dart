import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import 'reader_summary_external_link.dart';
import 'reader_summary_provider_label.dart';
import 'reader_summary_reason_text.dart';
import 'reader_summary_sections.dart';
import 'reader_summary_top_read_details.dart';
import 'reader_summary_top_read_leading.dart';

const _initialVisibleTopReads = 3;

class ReaderSummaryTopReads extends StatefulWidget {
  const ReaderSummaryTopReads({
    super.key,
    required this.items,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final List<TopRead> items;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryTopReads> createState() => _ReaderSummaryTopReadsState();
}

class _ReaderSummaryTopReadsState extends State<ReaderSummaryTopReads> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final visibleCount = _visibleCount(widget.items.length);
    final visibleItems = widget.items.take(visibleCount).toList();
    final hiddenCount = widget.items.length - visibleCount;
    final reservePreviewSpace = widget.items.any(
      (item) => item.previewMedia != null,
    );

    return ReaderSummarySection(
      title: 'Top reads',
      icon: Icons.open_in_new_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            key: const ValueKey('reader-summary-top-read-count'),
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              widget.items.length <= _initialVisibleTopReads
                  ? 'Showing ${widget.items.length} top reads'
                  : 'Showing $visibleCount of ${widget.items.length} top reads',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ),
          ...visibleItems.indexed.map(
            (entry) => _TopReadRow(
              index: entry.$1,
              item: entry.$2,
              reservePreviewSpace: reservePreviewSpace,
              citations: entry.$2.citationIds
                  .map((citationId) => widget.citationsById[citationId])
                  .whereType<SummaryCitation>()
                  .toList(growable: false),
              onOpenUrl: widget.onOpenUrl,
            ),
          ),
          if (widget.items.length > _initialVisibleTopReads) ...[
            const SizedBox(height: AppSpacing.xs),
            TextButton.icon(
              key: const ValueKey('reader-summary-top-reads-toggle'),
              onPressed: () => setState(() => _expanded = !_expanded),
              icon: Icon(
                _expanded
                    ? Icons.expand_less_outlined
                    : Icons.expand_more_outlined,
              ),
              label: Text(_expanded ? 'Show fewer' : 'Show $hiddenCount more'),
            ),
          ],
        ],
      ),
    );
  }

  int _visibleCount(int itemCount) {
    if (_expanded || itemCount <= _initialVisibleTopReads) {
      return itemCount;
    }
    return _initialVisibleTopReads;
  }
}

class _TopReadRow extends StatelessWidget {
  const _TopReadRow({
    required this.index,
    required this.item,
    required this.reservePreviewSpace,
    required this.citations,
    required this.onOpenUrl,
  });

  final int index;
  final TopRead item;
  final bool reservePreviewSpace;
  final List<SummaryCitation> citations;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: ValueKey('reader-summary-top-read-$index'),
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
                  ReaderSummaryTopReadLeading(
                    item: item,
                    compact: compact,
                    reservePreviewSpace: reservePreviewSpace,
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
                              label: readerSummaryProviderLabel(
                                item.providerKey,
                              ),
                              tone: AppStatusTone.neutral,
                            ),
                            AppStatusBadge(
                              label: 'Signal ${item.signalScore.toFixed(2)}',
                              tone: AppStatusTone.neutral,
                            ),
                            AppStatusBadge(
                              label: readerSummaryConfidenceLabel(
                                item.confidence,
                              ),
                              tone: readerSummaryConfidenceTone(
                                item.confidence,
                              ),
                            ),
                            if (item.confirmedProviderKeys.length > 1)
                              AppStatusBadge(
                                label:
                                    '${item.confirmedProviderKeys.length} providers',
                                tone: AppStatusTone.success,
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
                      key: ValueKey('reader-summary-top-read-$index-details'),
                      onPressed: () => _showDetails(context),
                      icon: const Icon(Icons.notes_outlined, size: 18),
                      label: const Text('Details'),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                readerSummaryDisplayReason(item),
                maxLines: compact ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (!compact)
                _InlineDetailsDisclosure(
                  index: index,
                  item: item,
                  citations: citations,
                  initiallyExpanded: index == 0,
                  onOpenUrl: onOpenUrl,
                ),
              if (compact && item.canonicalUrl != null) ...[
                const SizedBox(height: AppSpacing.xs),
                ReaderSummaryExternalLink(
                  url: item.canonicalUrl!,
                  onOpenUrl: onOpenUrl,
                  maxLines: 2,
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
            child: ReaderSummaryTopReadDetails(
              index: index,
              item: item,
              citations: citations,
              onOpenUrl: onOpenUrl,
            ),
          ),
        ),
      ),
    );
  }
}

class _InlineDetailsDisclosure extends StatelessWidget {
  const _InlineDetailsDisclosure({
    required this.index,
    required this.item,
    required this.citations,
    required this.initiallyExpanded,
    required this.onOpenUrl,
  });

  final int index;
  final TopRead item;
  final List<SummaryCitation> citations;
  final bool initiallyExpanded;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: ValueKey('reader-summary-top-read-$index-inline-details'),
        initiallyExpanded: initiallyExpanded,
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(
          'Why this matters',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        children: [
          ReaderSummaryTopReadDetails(
            index: index,
            item: item,
            citations: citations,
            citationsInitiallyExpanded: initiallyExpanded,
            onOpenUrl: onOpenUrl,
          ),
        ],
      ),
    );
  }
}
