import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_posts_page.dart';
import '../contracts/reader_post_catalog.dart';
import '../queries/list_reader_posts_query.dart';

final class ListReaderPostsUseCase {
  const ListReaderPostsUseCase(this._catalog);
  final ReaderPostCatalog _catalog;

  Future<Result<ReaderPostsPage>> execute(ListReaderPostsQuery query) =>
      _catalog.list(query);
}
