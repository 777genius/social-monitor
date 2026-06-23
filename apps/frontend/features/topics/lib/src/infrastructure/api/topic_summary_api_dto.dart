final class TopicSummaryApiDto {
  const TopicSummaryApiDto({
    required this.id,
    required this.name,
    required this.query,
    required this.status,
    this.weeklyMentionCount,
  });

  final String id;
  final String? name;
  final String? query;
  final String status;
  final int? weeklyMentionCount;
}

final class ListTopicsApiResponseDto {
  const ListTopicsApiResponseDto({
    required this.items,
    this.nextCursor,
    this.isPartial = false,
  });

  final List<TopicSummaryApiDto> items;
  final String? nextCursor;
  final bool isPartial;
}
