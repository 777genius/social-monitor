import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/reader_post_catalog.dart';
import '../../application/queries/list_reader_posts_query.dart';
import '../../domain/value_objects/reader_posts_page.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';
import '../mappers/reader_posts_page_rest_mapper.dart';

final class GeneratedReaderPostCatalog implements ReaderPostCatalog {
  GeneratedReaderPostCatalog({required Object runtime})
    : _runtime = runtime as generated.GeneratedApiRuntime;
  final generated.GeneratedApiRuntime _runtime;

  @override
  Future<Result<ReaderPostsPage>> list(ListReaderPostsQuery query) async {
    final hidden = query.excludedProviders.toList()..sort();
    final response = await _runtime.client.send<generated.ReaderPostsPageDto>(
      generated.WorkspaceRequest(scope: query.scope),
      () => _runtime.rest.readerSummaries.readerPostsControllerList(
        xTenantId: query.scope.tenantId,
        xWorkspaceId: query.scope.workspaceId,
        startedAt: query.period.startedAt.toUtc().toIso8601String(),
        endedAt: query.period.endedAt.toUtc().toIso8601String(),
        order: query.order == TopPostsSortOrder.engagement
            ? generated.Order.likes
            : generated.Order.model,
        limit: 12,
        cursor: query.cursor,
        excludedProviders: hidden.isEmpty ? null : hidden.join(','),
      ),
    );
    return response.fold(
      onSuccess: (dto) => Result.success(readerPostsPageFromRest(dto)),
      onFailure: Result<ReaderPostsPage>.failure,
    );
  }
}
