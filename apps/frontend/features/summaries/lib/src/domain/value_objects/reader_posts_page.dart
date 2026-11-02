import '../entities/top_read.dart';

/// Browse results are source posts, not authorized editorial promotions.
final class ReaderPostsPage {
  const ReaderPostsPage({
    required this.items,
    required this.total,
    required this.providerKeys,
    this.nextCursor,
  });

  final List<TopRead> items;
  final int total;
  final List<String> providerKeys;
  final String? nextCursor;
}
