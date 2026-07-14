part of 'reader_summary_brief_surface.dart';

/// Center column of the executive summary board: title, lede, body markdown,
/// citation trail and topic chips.
class ReaderSummaryExecutiveBrief extends StatelessWidget {
  const ReaderSummaryExecutiveBrief({
    super.key,
    required this.summary,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final content = summary.content;
    final textTheme = Theme.of(context).textTheme;
    final headline = _headlineCopy(_primaryTheme(content));
    final citationSourceById = _primaryCitationSourceById(content.topReads);
    final topics = _topicChipLabels(content.mainTopics);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          headline,
          style: textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm + 4),
        if (content.narrativeSections.isNotEmpty)
          _ReaderSummaryNarrative(
            sections: content.narrativeSections,
            claims: content.claimBoard,
            citationsById: citationsById,
            citationSourceById: citationSourceById,
            onOpenUrl: onOpenUrl,
          )
        else ...[
          _MarkdownBriefText(
            markdown: _summaryMarkdown(summary),
            onOpenUrl: onOpenUrl,
          ),
          const SizedBox(height: AppSpacing.sm),
          _BriefCitationTrail(
            keyBase: 'reader-summary-lede',
            citationIds: _summaryCitationIds(content),
            citationsById: citationsById,
            citationSourceById: citationSourceById,
            onOpenUrl: onOpenUrl,
          ),
        ],
        if (topics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [for (final topic in topics) _TopicChip(label: topic)],
          ),
        ],
      ],
    );
  }

  List<String> _topicChipLabels(List<String> mainTopics) {
    final labels = <String>[];
    final seen = <String>{};
    void add(String value) {
      final trimmed = value.trim();
      if (trimmed.isEmpty || _looksLikeRawId(trimmed)) {
        return;
      }
      if (seen.add(trimmed.toLowerCase())) {
        labels.add(trimmed);
      }
    }

    for (final topic in mainTopics) {
      add(topic);
    }
    return labels.take(6).toList(growable: false);
  }

  /// Raw ids (UUIDs, slug-ids) leak into signal lists from the backend and
  /// make terrible reader-facing topic chips, so keep them out.
  bool _looksLikeRawId(String value) {
    final normalized = value.replaceAll(' ', '-').toLowerCase();
    return _uuidLikePattern.hasMatch(normalized);
  }
}

final _uuidLikePattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

class _TopicChip extends StatelessWidget {
  const _TopicChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm + 4,
          vertical: AppSpacing.xs + 2,
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }
}
