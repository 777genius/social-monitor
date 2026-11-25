enum ReaderSummaryNarrativeSectionKind {
  lead,
  mainSignal,
  whyItMatters,
  secondarySignal,
  watch,
}

final class ReaderSummaryNarrativeSection {
  const ReaderSummaryNarrativeSection({
    required this.id,
    required this.kind,
    required this.title,
    required this.text,
    required this.citationIds,
    this.storyClusterId,
  });

  final String id;
  final ReaderSummaryNarrativeSectionKind kind;
  final String title;
  final String text;
  final List<String> citationIds;
  final String? storyClusterId;
}
