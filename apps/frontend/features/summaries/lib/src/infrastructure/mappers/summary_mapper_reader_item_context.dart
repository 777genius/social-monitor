part of 'summary_mapper.dart';

final class _ReaderItemContext {
  const _ReaderItemContext(
    this.kind,
    this.storyClusterIds,
    this.duplicateRelationIds,
    this.duplicateCanonicalRelationIds,
    this.storyClusterAuthorities,
    this.citationsById,
  );

  final _ReaderItemKind kind;
  final Set<String> storyClusterIds;
  final Set<String> duplicateRelationIds;
  final Set<String> duplicateCanonicalRelationIds;
  final Map<String, ReaderSummaryStoryClusterAuthorityApiDto>
  storyClusterAuthorities;
  final Map<String, SummaryCitationApiDto> citationsById;
}

enum _ReaderItemKind { topRead, selectedPost, interestSection }
