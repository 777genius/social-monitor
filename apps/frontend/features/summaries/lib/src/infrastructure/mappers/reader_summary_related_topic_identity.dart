part of 'summary_mapper.dart';

_RelatedTopicIdentity? _parseReaderSummaryRelatedTopicIdentity(
  String? relationId,
) {
  final identity = _normalizeReaderSummaryRelatedTopicIdentity(relationId);
  return identity?.isCanonical == true ? identity : null;
}

_RelatedTopicIdentity? _normalizeReaderSummaryRelatedTopicIdentity(
  String? relationId,
) {
  if (relationId == null) return null;
  final parts = relationId.split(':');
  if (parts.length != 6 || parts[0] != 'related-topic' || parts[1] != 'v1') {
    return null;
  }
  try {
    final decoded = parts.skip(2).map(Uri.decodeComponent).toList();
    final normalized = [
      decoded[0].trim().toLowerCase(),
      decoded[1].trim(),
      decoded[2].trim().toLowerCase(),
      decoded[3].trim(),
    ];
    if (normalized.any((part) => part.isEmpty)) return null;
    final canonical =
        'related-topic:v1:${normalized.map(Uri.encodeComponent).join(':')}';
    return _RelatedTopicIdentity(
      canonicalRelationId: canonical,
      isCanonical: canonical == relationId,
      subjectProviderKey: normalized[0],
      subjectSourceItemId: normalized[1],
      officialAnchorProviderKey: normalized[2],
      officialAnchorSourceItemId: normalized[3],
    );
  } catch (_) {
    return null;
  }
}

final class _RelatedTopicIdentity {
  const _RelatedTopicIdentity({
    required this.canonicalRelationId,
    required this.isCanonical,
    required this.subjectProviderKey,
    required this.subjectSourceItemId,
    required this.officialAnchorProviderKey,
    required this.officialAnchorSourceItemId,
  });

  final String canonicalRelationId;
  final bool isCanonical;
  final String subjectProviderKey;
  final String subjectSourceItemId;
  final String officialAnchorProviderKey;
  final String officialAnchorSourceItemId;
}
