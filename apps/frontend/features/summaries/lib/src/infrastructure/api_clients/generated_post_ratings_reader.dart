import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/post_rating_api_dto.dart';
import 'summaries_api_client.dart';

final class GeneratedPostRatingsReader {
  const GeneratedPostRatingsReader({
    required generated.GeneratedApiRuntime runtime,
  }) : _runtime = runtime;

  final generated.GeneratedApiRuntime _runtime;

  Future<Result<List<PostRatingApiDto>>> load(
    LoadPostRatingsApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListPostRatingsResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.relevance.relevanceControllerPostRatings(
            userId: request.userId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            body: generated.ListPostRatingsRequestDto(
              targets: request.targets
                  .map(
                    (target) => generated.PostRatingLookupTargetDto(
                      feedItemId: target.feedItemId,
                      sourceItemId: target.sourceItemId,
                      interestId: target.interestId,
                    ),
                  )
                  .toList(growable: false),
            ),
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(
        dto.ratings
            .map(
              (rating) => PostRatingApiDto(
                feedbackId: rating.feedbackId,
                userId: rating.userId,
                rating: rating.rating.toInt(),
                learningEffect: rating.learningEffect.json ?? 'unknown',
                reason: rating.reason?.json,
                feedItemId: rating.target.feedItemId,
                sourceItemId: rating.target.sourceItemId,
                interestId: rating.target.interestId,
                ratedAt: rating.ratedAt,
              ),
            )
            .toList(growable: false),
      ),
      onFailure: Result<List<PostRatingApiDto>>.failure,
    );
  }
}
