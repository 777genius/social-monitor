enum ReaderPostPromotionPlacement { top, additional }

final class ReaderPostPromotionAttestation {
  const ReaderPostPromotionAttestation({
    required this.candidateId,
    required this.canonicalIdentity,
    required this.placement,
    required this.slot,
    required this.decision,
    this.citationIds = const [],
  });

  final String candidateId;
  final String canonicalIdentity;
  final ReaderPostPromotionPlacement placement;
  final int slot;
  final String decision;
  final List<String> citationIds;
}
