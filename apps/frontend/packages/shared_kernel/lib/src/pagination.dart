final class PageRequest {
  const PageRequest({this.cursor, this.limit = defaultLimit});

  static const defaultLimit = 50;
  static const maxLimit = 100;

  final String? cursor;
  final int limit;

  PageRequest normalized() {
    return PageRequest(cursor: cursor, limit: limit.clamp(1, maxLimit));
  }
}

final class PageResult<T extends Object> {
  const PageResult({
    required this.items,
    required this.request,
    this.nextCursor,
    this.isPartial = false,
  });

  final List<T> items;
  final PageRequest request;
  final String? nextCursor;
  final bool isPartial;

  bool get hasMore => nextCursor != null;
}
