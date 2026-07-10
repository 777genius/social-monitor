part of 'reader_summary_brief_surface.dart';

class _ReaderSummaryNarrative extends StatelessWidget {
  const _ReaderSummaryNarrative({
    required this.sections,
    required this.claims,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
  });

  final List<ReaderSummaryNarrativeSection> sections;
  final List<SummaryClaim> claims;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final lead = _firstSection(ReaderSummaryNarrativeSectionKind.lead);
    final mainSignal = _firstSection(
      ReaderSummaryNarrativeSectionKind.mainSignal,
    );
    final whyItMatters = _firstSection(
      ReaderSummaryNarrativeSectionKind.whyItMatters,
    );
    final watch = _firstSection(ReaderSummaryNarrativeSectionKind.watch);
    final secondary = sections
        .where(
          (section) =>
              section.kind == ReaderSummaryNarrativeSectionKind.secondarySignal,
        )
        .take(3)
        .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (lead != null) _sectionBlock(lead),
        if (mainSignal != null) _sectionBlock(mainSignal),
        if (whyItMatters != null) _sectionBlock(whyItMatters),
        if (secondary.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Other signals today',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final section in secondary) _sectionBlock(section),
        ],
        if (watch != null) _sectionBlock(watch),
      ],
    );
  }

  Widget _sectionBlock(ReaderSummaryNarrativeSection section) {
    final label = _sectionLabel(section);
    final markdown = label == null
        ? section.text
        : '- **$label:** ${section.text}';
    return Padding(
      key: ValueKey('reader-summary-narrative-${section.id}'),
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final text = KeyedSubtree(
            key: ValueKey('reader-summary-narrative-${section.id}-text'),
            child: _MarkdownBriefText(markdown: markdown, onOpenUrl: onOpenUrl),
          );
          final trail = _BriefCitationTrail(
            key: ValueKey('reader-summary-narrative-${section.id}-trail'),
            keyBase: 'reader-summary-narrative-${section.id}',
            citationIds: section.citationIds,
            citationsById: citationsById,
            citationSourceById: citationSourceById,
            onOpenUrl: onOpenUrl,
            claim: _claimFor(section),
          );
          if (constraints.maxWidth < 520) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                text,
                const SizedBox(height: AppSpacing.xs),
                trail,
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: text),
              const SizedBox(width: AppSpacing.xs),
              Padding(padding: const EdgeInsets.only(top: 3), child: trail),
            ],
          );
        },
      ),
    );
  }

  ReaderSummaryNarrativeSection? _firstSection(
    ReaderSummaryNarrativeSectionKind kind,
  ) {
    for (final section in sections) {
      if (section.kind == kind) {
        return section;
      }
    }
    return null;
  }

  SummaryClaim? _claimFor(ReaderSummaryNarrativeSection section) {
    for (final claim in claims) {
      if (claim.id == section.id) {
        return claim;
      }
    }
    final citationIds = section.citationIds.toSet();
    for (final claim in claims) {
      if (claim.id == null && claim.citationIds.any(citationIds.contains)) {
        return claim;
      }
    }
    return null;
  }

  String? _sectionLabel(ReaderSummaryNarrativeSection section) {
    return switch (section.kind) {
      ReaderSummaryNarrativeSectionKind.lead => null,
      ReaderSummaryNarrativeSectionKind.mainSignal => 'Main signal',
      ReaderSummaryNarrativeSectionKind.whyItMatters => 'Why it matters',
      ReaderSummaryNarrativeSectionKind.secondarySignal => section.title,
      ReaderSummaryNarrativeSectionKind.watch => 'Watch',
    };
  }
}
