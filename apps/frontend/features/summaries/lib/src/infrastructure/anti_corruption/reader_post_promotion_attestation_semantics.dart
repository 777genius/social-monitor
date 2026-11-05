part of 'reader_post_promotion_attestation_verifier.dart';

// Backend policy exclusively owns thresholds, ranking, placement, caps, and
// diversity. The client verifies only schema-bound provenance and ordering.
bool _validPromotionSemantics(Map<String, Object?> body) {
  final periodStart = _promotionDate(
    body['exactPeriodStart'], body['periodStartedAt'],
  );
  final periodEnd = _promotionDate(
    body['exactPeriodEnd'], body['periodEndedAt'],
  );
  final cutoff = _promotionDate(
    body['exactIngestionCutoff'], body['ingestionCutoff'],
  );
  if (periodStart == null || periodEnd == null || cutoff == null ||
      !periodStart.isBefore(periodEnd) || body.containsKey('relationTrace') ||
      !_validInputProvenance(
        body,
        periodStart: periodStart,
        periodEnd: periodEnd,
        cutoff: cutoff,
      )) {
    return false;
  }
  final leadId = body['candidateId']! as String;
  final leadIdentity = body['canonicalIdentity']! as String;
  final supports = (body['supportFacts']! as List<Object?>)
      .cast<Map<String, Object?>>();
  for (final support in supports) {
    final supportStart = _promotionDate(
      support['exactPeriodStart'], support['periodStart'],
    );
    final supportEnd = _promotionDate(
      support['exactPeriodEnd'], support['periodEnd'],
    );
    final supportCutoff = _promotionDate(
      support['exactIngestionCutoff'], support['ingestionCutoff'],
    );
    final relation = support['relation'] as Map<String, Object?>?;
    if (support['candidateId'] == leadId ||
        supportStart != periodStart || supportEnd != periodEnd ||
        supportCutoff != cutoff ||
        !_validInputProvenance(
          support,
          periodStart: periodStart,
          periodEnd: periodEnd,
          cutoff: cutoff,
        ) ||
        (relation != null &&
          relation['targetCanonicalIdentity'] != leadIdentity)) {
      return false;
    }
  }
  return true;
}

bool _validInputProvenance(
  Map<String, Object?> input, {
  required DateTime periodStart,
  required DateTime periodEnd,
  required DateTime cutoff,
}) {
  final publishedAt = _promotionDate(
    input['exactPublishedAt'], input['publishedAt'],
  );
  final observedAt = _promotionDate(
    input['exactObservedAt'], input['observedAt'],
  );
  if (publishedAt == null || observedAt == null ||
      publishedAt.isBefore(periodStart) || !publishedAt.isBefore(periodEnd) ||
      observedAt.isBefore(publishedAt) || observedAt.isAfter(cutoff)) {
    return false;
  }
  final metrics = input['metrics']! as Map<String, Object?>;
  if (metrics['provider'] != 'github_radar') return true;
  final windowStart = _canonicalDate(metrics['windowStartedAt']);
  final windowEnd = _canonicalDate(metrics['windowEndedAt']);
  final checkedAt = _canonicalDate(input['checkedAt']);
  if (windowStart == null || windowEnd == null || checkedAt == null ||
      !windowStart.isBefore(windowEnd) || windowEnd != checkedAt ||
      windowEnd.isAfter(cutoff)) {
    return false;
  }
  final duration = windowEnd.difference(windowStart);
  return duration == const Duration(hours: 24) ||
      duration == const Duration(hours: 48);
}

DateTime? _canonicalDate(Object? value) {
  if (value is! String) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null || !parsed.isUtc || parsed.toIso8601String() != value) {
    return null;
  }
  return parsed;
}

DateTime? _promotionDate(Object? exact, Object? display) {
  if (exact == null) return _canonicalDate(display);
  if (exact is! String ||
      !RegExp(
        r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$',
      ).hasMatch(exact)) {
    return null;
  }
  final parsed = DateTime.tryParse(exact);
  return parsed?.isUtc == true ? parsed : null;
}
