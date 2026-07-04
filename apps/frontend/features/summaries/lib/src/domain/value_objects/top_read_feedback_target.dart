final class TopReadFeedbackTarget {
  const TopReadFeedbackTarget({
    required this.providerKey,
    required this.interestId,
    required this.title,
    required this.citationIds,
    this.feedItemId,
    this.sourceItemId,
    this.bodyPreview,
    this.canonicalUrl,
  });

  final String providerKey;
  final String interestId;
  final String title;
  final String? feedItemId;
  final String? sourceItemId;
  final String? bodyPreview;
  final String? canonicalUrl;
  final List<String> citationIds;

  bool get isValid {
    return providerKey.trim().isNotEmpty &&
        interestId.trim().isNotEmpty &&
        (title.trim().isNotEmpty || (bodyPreview?.trim().isNotEmpty ?? false));
  }

  bool get hasPostIdentity {
    return (feedItemId?.trim().isNotEmpty ?? false) ||
        (sourceItemId?.trim().isNotEmpty ?? false);
  }
}
