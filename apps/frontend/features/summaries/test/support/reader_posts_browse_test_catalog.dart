import 'dart:async';

import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_post_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/list_reader_posts_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_reader_posts_use_case.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/reader_posts_browse_store.dart';

final class ControlledReaderPostCatalog implements ReaderPostCatalog {
  final queries = <ListReaderPostsQuery>[];
  final responses = <Completer<Result<ReaderPostsPage>>>[];

  @override
  Future<Result<ReaderPostsPage>> list(ListReaderPostsQuery query) {
    queries.add(query);
    final response = Completer<Result<ReaderPostsPage>>();
    responses.add(response);
    return response.future;
  }

  ReaderPostsBrowseStore createStore() => ReaderPostsBrowseStore(
    list: ListReaderPostsUseCase(this),
    scope: const WorkspaceScope(
      tenantId: 'tenant-test',
      workspaceId: 'workspace-test',
    ),
  );
}
