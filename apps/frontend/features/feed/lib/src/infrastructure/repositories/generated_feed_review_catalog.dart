import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/triage_mention_command.dart';
import '../../application/contracts/feed_review_catalog.dart';
import '../../application/queries/list_feed_mentions_query.dart';
import '../../domain/entities/feed_mention.dart';
import '../api/feed_mention_api_dto.dart';
import '../api_clients/in_memory_feed_api_client.dart';
import '../mappers/feed_mention_mapper.dart';

final class GeneratedFeedReviewCatalog implements FeedReviewCatalog {
  const GeneratedFeedReviewCatalog({
    required FeedApiClient apiClient,
    FeedMentionMapper mapper = const FeedMentionMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final FeedApiClient _apiClient;
  final FeedMentionMapper _mapper;

  @override
  Future<Result<PageResult<FeedMention>>> listMentions(
    ListFeedMentionsQuery query,
  ) async {
    final normalized = query.normalized();
    final result = await _apiClient.listMentions(
      ListFeedMentionsApiRequest.fromQuery(normalized),
    );
    return result.fold(
      onSuccess: (page) => Result.success(
        PageResult<FeedMention>(
          items: page.items.map(_mapper.toDomain).toList(growable: false),
          request: normalized.page,
          nextCursor: page.nextCursor,
        ),
      ),
      onFailure: Result<PageResult<FeedMention>>.failure,
    );
  }

  @override
  Future<Result<FeedMention>> triageMention(
    TriageMentionCommand command,
  ) async {
    final result = await _apiClient.triageMention(
      command.mentionId,
      command.nextState,
    );
    return _mapMentionResult(result);
  }

  Result<FeedMention> _mapMentionResult(Result<FeedMentionApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<FeedMention>.failure,
    );
  }
}
