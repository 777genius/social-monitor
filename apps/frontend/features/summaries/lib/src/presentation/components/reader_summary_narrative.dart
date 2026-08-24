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
    final watch = sections
        .where(
          (section) => section.kind == ReaderSummaryNarrativeSectionKind.watch,
        )
        .toList(growable: false);
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
        for (final section in watch) _watchBlock(section),
      ],
    );
  }

  Widget _watchBlock(ReaderSummaryNarrativeSection section) {
    final isGitHubTrending =
        section.id == 'github-trending' ||
        section.title.trim().toLowerCase() == 'github trending';
    final lines = isGitHubTrending
        ? formatGitHubTrendingWatchLines(section.text)
        : const <GitHubTrendingWatchLine>[];
    if (lines.isEmpty) return _sectionBlock(section);
    return Padding(
      key: ValueKey('reader-summary-narrative-${section.id}'),
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: _ReaderSummaryGitHubWatchAppendix(
        section: section,
        lines: lines,
        citationsById: citationsById,
        citationSourceById: citationSourceById,
        onOpenUrl: onOpenUrl,
      ),
    );
  }

  Widget _sectionBlock(ReaderSummaryNarrativeSection section) {
    final label = _sectionLabel(section);
    final claim = _claimFor(section);
    final hasCitations = _citationsForIds(
      section.citationIds,
      citationsById,
    ).isNotEmpty;
    return Padding(
      key: ValueKey('reader-summary-narrative-${section.id}'),
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: _InlineNarrativeText(
        key: ValueKey('reader-summary-narrative-${section.id}-text'),
        keyBase: 'reader-summary-narrative-${section.id}',
        label: label,
        text: section.text,
        claim: claim,
        citationIds: section.citationIds,
        citationsById: citationsById,
        citationSourceById: citationSourceById,
        onOpenUrl: onOpenUrl,
        showTrail: hasCitations,
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

class _InlineNarrativeText extends StatelessWidget {
  const _InlineNarrativeText({
    super.key,
    required this.keyBase,
    required this.label,
    required this.text,
    required this.claim,
    required this.citationIds,
    required this.citationsById,
    required this.citationSourceById,
    required this.onOpenUrl,
    required this.showTrail,
  });

  final String keyBase;
  final String? label;
  final String text;
  final SummaryClaim? claim;
  final List<String> citationIds;
  final Map<String, SummaryCitation> citationsById;
  final Map<String, _CitationSourceContext> citationSourceById;
  final ValueChanged<String> onOpenUrl;
  final bool showTrail;

  @override
  Widget build(BuildContext context) {
    final bodyStyle = Theme.of(
      context,
    ).textTheme.bodyLarge?.copyWith(height: 1.45, letterSpacing: 0);
    final hasMarkdownList = _hasNarrativeMarkdownList(text);
    final anchorEnd = showTrail
        ? ReaderSummaryClaimAnchorResolver.resolveEnd(
            text: text,
            claimText: claim?.claim,
          )
        : text.length;

    return Text.rich(
      TextSpan(
        style: bodyStyle,
        children: [
          if (label != null) ...[
            const TextSpan(text: '\u2022 '),
            TextSpan(
              text: '$label:${hasMarkdownList ? '\n' : ' '}',
              style: bodyStyle?.copyWith(fontWeight: FontWeight.w900),
            ),
          ],
          ..._narrativeMarkdownSpans(
            text.substring(0, anchorEnd),
            bodyStyle: bodyStyle,
          ),
          if (showTrail)
            WidgetSpan(
              alignment: PlaceholderAlignment.aboveBaseline,
              baseline: TextBaseline.alphabetic,
              child: Padding(
                padding: const EdgeInsets.only(left: 3, bottom: 1),
                child: _BriefCitationTrail(
                  key: ValueKey('$keyBase-trail'),
                  keyBase: keyBase,
                  citationIds: citationIds,
                  citationsById: citationsById,
                  citationSourceById: citationSourceById,
                  onOpenUrl: onOpenUrl,
                  claim: claim,
                  inline: true,
                ),
              ),
            ),
          ..._narrativeMarkdownSpans(
            text.substring(anchorEnd),
            bodyStyle: bodyStyle,
          ),
        ],
      ),
    );
  }
}

bool _hasNarrativeMarkdownList(String value) {
  return RegExp(r'(^|\n)\s*-\s+').hasMatch(value);
}

List<InlineSpan> _narrativeMarkdownSpans(
  String value, {
  required TextStyle? bodyStyle,
}) {
  final normalized = value.replaceAllMapped(
    RegExp(r'(^|\n)\s*-\s+'),
    (match) => '${match.group(1) ?? ''}\u2022 ',
  );
  final strongPattern = RegExp(r'\*\*([^*\n]+)\*\*');
  final spans = <InlineSpan>[];
  var offset = 0;

  for (final match in strongPattern.allMatches(normalized)) {
    if (match.start > offset) {
      spans.add(TextSpan(text: normalized.substring(offset, match.start)));
    }
    spans.add(
      TextSpan(
        text: match.group(1),
        style: bodyStyle?.copyWith(fontWeight: FontWeight.w900),
      ),
    );
    offset = match.end;
  }

  if (offset < normalized.length) {
    spans.add(TextSpan(text: normalized.substring(offset)));
  }
  return spans;
}
