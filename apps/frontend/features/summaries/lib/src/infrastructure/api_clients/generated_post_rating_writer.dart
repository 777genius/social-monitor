import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/post_rating_api_dto.dart';
import 'summaries_api_client.dart';

final class GeneratedPostRatingWriter {
  const GeneratedPostRatingWriter({
    required generated.GeneratedApiRuntime runtime,
  }) : _runtime = runtime;

  final generated.GeneratedApiRuntime _runtime;

  Future<Result<PostRatingSubmissionApiDto>> submit(
    SubmitPostRatingApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.RecordPostRatingResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.relevance
              .relevanceControllerRecordPostRatingForUser(
                userId: request.userId,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                body: generated.RecordPostRatingRequestDto(
                  idempotencyKey: request.idempotencyKey,
                  interestId: request.target.interestId,
                  providerKey: request.target.providerKey,
                  rating: request.rating,
                  reason: request.reason == null
                      ? null
                      : generated
                            .RecordPostRatingRequestDtoReasonReason.fromJson(
                          request.reason!.apiValue,
                        ),
                  title: request.target.title,
                  bodyPreview: request.target.bodyPreview,
                  canonicalUrl: request.target.canonicalUrl,
                  feedItemId: request.target.feedItemId,
                  sourceItemId: request.target.sourceItemId,
                ),
              ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(
        PostRatingSubmissionApiDto(
          created: dto.created,
          learningDirection: dto.learningDirection.json ?? 'unknown',
          rating: PostRatingApiDto(
            feedbackId: dto.rating.feedbackId,
            userId: dto.rating.userId,
            rating: dto.rating.rating.toInt(),
            learningEffect: dto.rating.learningEffect.json ?? 'unknown',
            reason: dto.rating.reason?.json,
            feedItemId: dto.rating.target.feedItemId,
            sourceItemId: dto.rating.target.sourceItemId,
            interestId: dto.rating.target.interestId,
            ratedAt: dto.rating.ratedAt,
          ),
        ),
      ),
      onFailure: Result<PostRatingSubmissionApiDto>.failure,
    );
  }
}
