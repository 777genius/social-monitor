import 'top_read.dart';

final class SummaryClaimEvidence {
  const SummaryClaimEvidence({
    required this.title,
    required this.providerKey,
    required this.citationId,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String citationId;
  final String? canonicalUrl;
}

final class SummaryClaimRisk {
  const SummaryClaimRisk({required this.kind, required this.description});

  final String kind;
  final String description;
}

final class SummaryClaim {
  const SummaryClaim({
    this.id,
    required this.claim,
    required this.evidence,
    required this.confidence,
    required this.risks,
    required this.citationIds,
  });

  final String? id;
  final String claim;
  final List<SummaryClaimEvidence> evidence;
  final TopReadConfidence confidence;
  final List<SummaryClaimRisk> risks;
  final List<String> citationIds;
}
