part of 'generated_summary_rest_mapper.dart';

List<SummaryStoryApiDto> _readerSummaryTopStories(
  Iterable<generated.ReaderSummaryTopStoryDto> stories,
) => stories
    .map(
      (story) => SummaryStoryApiDto(
        storyClusterId: story.storyClusterId,
        title: story.title,
        summary: story.summary,
        topicCount: story.interestIds.length,
        providerCount: readerSummaryIndependentProviderFamilies(
          story.providerKeys,
        ).length,
        interestIds: story.interestIds,
        providerKeys: story.providerKeys,
        citationIds: story.citationIds,
      ),
    )
    .toList(growable: false);

List<String> _readerSummaryStoryClusterIds(
  Iterable<generated.ReaderSummaryStoryClusterDto> clusters,
) => clusters
    .map((cluster) => cluster.id.trim())
    .where((id) => id.isNotEmpty)
    .toList(growable: false);

List<ReaderSummaryStoryClusterAuthorityApiDto>
_readerSummaryStoryClusterAuthorities(
  Iterable<generated.ReaderSummaryStoryClusterDto> clusters,
) => clusters
    .map(
      (cluster) => ReaderSummaryStoryClusterAuthorityApiDto(
        id: cluster.id,
        feedItemIds: [
          cluster.representativeFeedItemId,
          ...cluster.duplicateFeedItemIds,
        ],
        providerKeys: cluster.providerKeys,
      ),
    )
    .toList(growable: false);
