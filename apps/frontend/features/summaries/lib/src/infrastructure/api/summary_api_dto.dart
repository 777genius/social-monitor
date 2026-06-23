final class SummaryCitationApiDto {
  const SummaryCitationApiDto({
    required this.id,
    required this.sourceLabel,
    required this.rawSnippet,
  });

  final String id;
  final String sourceLabel;
  final String rawSnippet;
}

final class SummaryApiDto {
  const SummaryApiDto({
    required this.id,
    required this.title,
    required this.status,
    required this.bodyText,
    required this.citations,
    required this.freshnessLabel,
    required this.feedbackSubmitted,
  });

  final String id;
  final String title;
  final String status;
  final String bodyText;
  final List<SummaryCitationApiDto> citations;
  final String freshnessLabel;
  final bool feedbackSubmitted;
}

final class SummaryPageApiDto {
  const SummaryPageApiDto({required this.items, this.nextCursor});

  final List<SummaryApiDto> items;
  final String? nextCursor;
}
