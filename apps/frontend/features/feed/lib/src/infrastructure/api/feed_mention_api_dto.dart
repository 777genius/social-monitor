final class FeedMentionApiDto {
  const FeedMentionApiDto({
    required this.id,
    required this.title,
    required this.sourceName,
    required this.sentiment,
    required this.triageState,
    required this.rawEvidenceText,
    required this.provenanceLabel,
  });

  final String id;
  final String title;
  final String sourceName;
  final String sentiment;
  final String triageState;
  final String rawEvidenceText;
  final String provenanceLabel;
}

final class FeedMentionPageApiDto {
  const FeedMentionPageApiDto({required this.items, this.nextCursor});

  final List<FeedMentionApiDto> items;
  final String? nextCursor;
}
