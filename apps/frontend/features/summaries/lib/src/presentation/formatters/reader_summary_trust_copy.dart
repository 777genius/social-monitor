import '../../domain/aggregates/reader_summary.dart';
import '../view_models/reader_summary_trust_snapshot.dart';

String trustConfidenceBadgeLabel(String level) {
  return '${_levelLabel(level)} confidence';
}

String trustSummaryConfidenceBadgeLabel(ReaderSummaryTrustSnapshot snapshot) {
  return snapshot.hasMixedConfidence
      ? 'Mixed confidence'
      : trustConfidenceBadgeLabel(snapshot.confidenceLevel);
}

String trustEvidenceRiskBadgeLabel(String level) {
  return '${_levelLabel(level)} evidence risk';
}

String trustVerdictTitle(ReaderSummaryTrustSnapshot snapshot) {
  if (snapshot.needsConfirmation) {
    return 'Needs confirmation';
  }
  if (snapshot.confidenceLevel == 'high') {
    return 'Well supported';
  }
  return 'Useful signal';
}

String trustVerdictDescription(ReaderSummaryTrustSnapshot snapshot) {
  if (snapshot.needsConfirmation) {
    return 'Treat this as a lead until another independent source group confirms the key items.';
  }
  if (snapshot.confidenceLevel == 'high') {
    return 'Multiple monitored source groups support the key items.';
  }
  return 'Evidence is linked, but review the cited sources before relying on it.';
}

String trustSourceGroupLabel(int count) {
  return '$count source ${count == 1 ? 'group' : 'groups'}';
}

String trustClaimSupportLabel(SummaryClaim claim) {
  return trustClaimLacksIndependentConfirmation(claim)
      ? 'Not independently confirmed'
      : trustSourceGroupLabel(uniqueClaimSourceGroupCount(claim));
}

bool trustClaimNeedsConfirmation(SummaryClaim claim) {
  final riskKinds = claim.risks.map((risk) => risk.kind).toSet();

  return trustClaimLacksIndependentConfirmation(claim) ||
      claim.confidence.level == 'low' ||
      claim.confidence.score < 0.5 ||
      riskKinds.contains('low_confidence') ||
      riskKinds.contains('unresolved');
}

bool trustClaimLacksIndependentConfirmation(SummaryClaim claim) {
  final riskKinds = claim.risks.map((risk) => risk.kind).toSet();

  return uniqueClaimSourceGroupCount(claim) <= 1 ||
      riskKinds.contains('single_source');
}

int uniqueClaimSourceGroupCount(SummaryClaim claim) {
  return {
    for (final evidence in claim.evidence)
      if (evidence.providerKey.trim().isNotEmpty) evidence.providerKey.trim(),
  }.length;
}

String trustConfidenceExplanation(TopReadConfidence confidence) {
  final rationale = confidence.rationale.trim();
  final lower = rationale.toLowerCase();

  if (lower.contains('single-source story signal') ||
      lower.contains('not been independently confirmed')) {
    return 'This story appears in monitored sources, but independent confirmation is missing.';
  }
  if (lower.contains('source items support this story') ||
      lower.contains('cited items support this story')) {
    return 'There are multiple cited items, but not enough independent confirmation yet.';
  }
  if (lower.contains('cited source groups support this story')) {
    return 'Multiple cited source groups support this story, but the key claim has not been fully cross-verified yet.';
  }
  if (lower.contains('providers confirm this story') ||
      lower.contains('source families support this story') ||
      lower.contains('source groups support this story')) {
    return 'Multiple monitored source groups support this story.';
  }

  return rationale.isEmpty
      ? 'Evidence exists, but the confidence rationale is not available.'
      : _plainTrustDescription(rationale);
}

String trustClaimRiskBadgeLabel(String kind) {
  return switch (kind) {
    'single_source' => 'Needs confirmation',
    'low_confidence' => 'Low confidence',
    _ => 'Needs review',
  };
}

String trustClaimRiskDescription(SummaryClaimRisk risk) {
  final lower = risk.description.trim().toLowerCase();

  if (risk.kind == 'single_source' ||
      lower.contains('single-source claim') ||
      lower.contains('independent confirmation')) {
    return 'Treat this as a lead until another independent source group confirms it.';
  }
  if (risk.kind == 'low_confidence') {
    return 'The system found evidence, but not enough independent support to make this reliable.';
  }

  return _plainTrustDescription(risk.description);
}

String trustReliabilityRiskDescription(SummaryReliabilityRisk risk) {
  return switch (risk.kind) {
    'weak_source' =>
      'Some sources look weaker or promotional, so treat them as leads, not proof.',
    'single_source' =>
      'Important items still need confirmation from another independent source group.',
    'low_evidence_diversity' =>
      'Coverage is broad, but the strongest stories are not independently connected yet.',
    'duplicate_risk' =>
      'Some items may repeat the same story, so repeated coverage should not be counted as proof.',
    'stale_evidence' =>
      'Some evidence may be old for this summary window; check newer sources before acting.',
    _ => _plainTrustDescription(risk.description),
  };
}

String _plainTrustDescription(String description) {
  final trimmed = description.trim();
  final lower = trimmed.toLowerCase();

  if (lower.contains('backend') ||
      lower.contains('cross-provider cluster') ||
      lower.contains('story cluster')) {
    return 'The cited sources are not linked as one confirmed story yet; treat this as a lead.';
  }

  return trimmed;
}

String _levelLabel(String level) {
  return switch (level) {
    'high' => 'High',
    'medium' => 'Medium',
    _ => 'Low',
  };
}
