import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_posts_page.dart';
import '../queries/list_reader_posts_query.dart';

abstract interface class ReaderPostCatalog {
  Future<Result<ReaderPostsPage>> list(ListReaderPostsQuery query);
}
