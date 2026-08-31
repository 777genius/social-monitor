part of 'reader_post_promotion_attestation_verifier.dart';

bool _validSupportFacts(Object? value) {
  if (value is! List<Object?> ||
      value.any((item) => item is! Map<String, Object?>)) {
    return false;
  }
  final facts = value.cast<Map<String, Object?>>();
  final ids = <String>{};
  for (final fact in facts) {
    if (!_exactKeys(
          fact,
          const {
            'candidateId',
            'provider',
            'contentKind',
            'canonicalIdentity',
            'citationId',
            'publishedAt',
            'observedAt',
            'periodStart',
            'periodEnd',
            'ingestionCutoff',
            'freshnessValid',
            'qualityScore',
            'relevanceScore',
            'integrityScore',
            'qualityValid',
            'safetyValid',
            'citationValid',
            'metricsState',
            'metrics',
            'whyImportant',
          },
          const {
            'checkedAt',
            'authorityAttestation',
            'relation',
            'clusterId',
            'exactPublishedAt',
            'exactObservedAt',
            'exactPeriodStart',
            'exactPeriodEnd',
            'exactIngestionCutoff',
          },
        ) ||
        !_nonEmptyStrings(fact, const {
          'candidateId',
          'provider',
          'canonicalIdentity',
          'citationId',
        }) ||
        !ids.add(fact['candidateId']! as String) ||
        !_validContentKind(fact['contentKind']) ||
        !_isoDate(fact['publishedAt']) ||
        !_isoDate(fact['observedAt']) ||
        !_isoDate(fact['periodStart']) ||
        !_isoDate(fact['periodEnd']) ||
        !_isoDate(fact['ingestionCutoff']) ||
        !_validOptionalExactPromotionTimestamps(fact) ||
        (fact.containsKey('checkedAt') && !_isoDate(fact['checkedAt'])) ||
        fact['freshnessValid'] is! bool ||
        fact['qualityValid'] is! bool ||
        fact['safetyValid'] is! bool ||
        fact['citationValid'] is! bool ||
        !_unit(fact['qualityScore']) ||
        !_unit(fact['relevanceScore']) ||
        !_unit(fact['integrityScore']) ||
        fact['metricsState'] != 'observed' ||
        !_validMetrics(fact['metrics'], fact['provider']) ||
        !_validAuthority(fact['authorityAttestation']) ||
        !_validRelation(fact['relation']) ||
        fact['whyImportant'] is! String ||
        (fact['whyImportant']! as String).trim().isEmpty ||
        (fact.containsKey('clusterId') &&
            (fact['clusterId'] is! String ||
                (fact['clusterId']! as String).trim().isEmpty))) {
      return false;
    }
  }
  for (var index = 1; index < facts.length; index++) {
    if (_compareSupportFacts(facts[index - 1], facts[index]) > 0) return false;
  }
  return true;
}

int _compareSupportFacts(
  Map<String, Object?> left,
  Map<String, Object?> right,
) {
  final published = _promotionDate(
    right['exactPublishedAt'],
    right['publishedAt'],
  )!.compareTo(_promotionDate(left['exactPublishedAt'], left['publishedAt'])!);
  if (published != 0) return published;
  final identity = (left['canonicalIdentity']! as String).compareTo(
    right['canonicalIdentity']! as String,
  );
  return identity != 0
      ? identity
      : (left['candidateId']! as String).compareTo(
          right['candidateId']! as String,
        );
}

bool _validUsefulness(Object? value) =>
    value is Map<String, Object?> &&
    _exactKeys(value, const {
      'normalizedStrength',
      'qualityScore',
      'interestRelevanceScore',
      'engagementIntegrityScore',
      'freshness',
      'total',
    }, const {}) &&
    value.values.every(_finiteNonNegative);

bool _validAuthority(Object? value) {
  if (value == null) return true;
  if (value is! Map<String, Object?> ||
      !_exactKeys(value, const {
        'status',
        'official',
        'trusted',
        'attestedBy',
      }, const {}) ||
      value['status'] != 'attested' ||
      value['official'] is! bool ||
      value['trusted'] is! bool ||
      (value['attestedBy'] != 'producer' &&
          value['attestedBy'] != 'source_catalog')) {
    return false;
  }
  return true;
}

bool _validRelation(Object? value, {bool required = false}) {
  if (value == null) return !required;
  return value is Map<String, Object?> &&
      _exactKeys(value, const {
        'kind',
        'targetCanonicalIdentity',
        'confidence',
        'approved',
      }, const {}) &&
      value['kind'] == 'same_story' &&
      value['targetCanonicalIdentity'] is String &&
      (value['targetCanonicalIdentity']! as String).trim().isNotEmpty &&
      _unit(value['confidence']) &&
      value['approved'] is bool;
}

bool _validMetrics(Object? value, Object? rawProvider) {
  if (value is! Map<String, Object?> || rawProvider is! String) return false;
  final family = _providerFamily(rawProvider);
  if (value['provider'] != family) return false;
  switch (family) {
    case 'x':
      return _exactKeys(value, const {
            'provider',
            'likes',
            'reposts',
            'weightedScore',
          }, const {}) &&
          _count(value['likes']) &&
          _count(value['reposts']) &&
          _count(value['weightedScore']);
    case 'reddit':
      return _exactKeys(
            value,
            const {'provider', 'score'},
            const {'upvoteRatio'},
          ) &&
          _count(value['score']) &&
          (!value.containsKey('upvoteRatio') || _unit(value['upvoteRatio']));
    case 'hacker_news':
      return _exactKeys(value, const {'provider', 'points'}, const {}) &&
          _count(value['points']);
    case 'github_radar':
      return _exactKeys(value, const {
            'provider',
            'snapshotKind',
            'windowStartedAt',
            'windowEndedAt',
            'starsDelta',
            'forksDelta',
          }, const {}) &&
          value['snapshotKind'] == 'repository_growth' &&
          _isoDate(value['windowStartedAt']) &&
          _isoDate(value['windowEndedAt']) &&
          _count(value['starsDelta']) &&
          _count(value['forksDelta']);
  }
  return false;
}

String? _providerFamily(String provider) {
  final normalized = provider.trim().toLowerCase();
  if (const {'x', 'x-twitter', 'twitter'}.contains(normalized)) return 'x';
  if (normalized == 'reddit') return 'reddit';
  if (const {'hacker_news', 'hacker-news', 'hn'}.contains(normalized)) {
    return 'hacker_news';
  }
  if (const {'github_radar', 'github-repo-radar'}.contains(normalized)) {
    return 'github_radar';
  }
  return null;
}

bool _validContentKind(Object? value) =>
    const {'original_post', 'story', 'repository'}.contains(value);

bool _exactKeys(
  Map<String, Object?> value,
  Set<String> required,
  Set<String> optional,
) =>
    required.every(value.containsKey) &&
    value.keys.every((key) => required.contains(key) || optional.contains(key));
bool _nonEmptyStrings(Map<String, Object?> value, Set<String> keys) =>
    keys.every(
      (key) =>
          value[key] is String && (value[key]! as String).trim().isNotEmpty,
    );
bool _isoDate(Object? value) =>
    value is String && DateTime.tryParse(value) != null;
bool _validOptionalExactPromotionTimestamps(Map<String, Object?> value) {
  final pattern = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$');
  final pairs = <(String, String)>[
    ('exactPublishedAt', 'publishedAt'),
    ('exactObservedAt', 'observedAt'),
    (
      'exactPeriodStart',
      value.containsKey('periodStartedAt') ? 'periodStartedAt' : 'periodStart',
    ),
    (
      'exactPeriodEnd',
      value.containsKey('periodEndedAt') ? 'periodEndedAt' : 'periodEnd',
    ),
    ('exactIngestionCutoff', 'ingestionCutoff'),
  ];
  return pairs.every((pair) {
    if (!value.containsKey(pair.$1)) return true;
    final exact = value[pair.$1];
    final display = value[pair.$2];
    if (exact is! String || display is! String || !pattern.hasMatch(exact)) {
      return false;
    }
    final parsed = DateTime.tryParse(exact);
    final displayParsed = DateTime.tryParse(display);
    return parsed?.isUtc == true &&
        displayParsed?.isUtc == true &&
        _exactPromotionTimestamp(parsed!) == exact &&
        displayParsed!.millisecondsSinceEpoch == parsed.millisecondsSinceEpoch;
  });
}

String _exactPromotionTimestamp(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}T'
    '${value.hour.toString().padLeft(2, '0')}:'
    '${value.minute.toString().padLeft(2, '0')}:'
    '${value.second.toString().padLeft(2, '0')}.'
    '${(value.millisecond * 1000 + value.microsecond).toString().padLeft(6, '0')}Z';
bool _integer(Object? value) =>
    value is num && value.isFinite && value >= 0 && value == value.toInt();
bool _count(Object? value) => _integer(value);
bool _unit(Object? value) =>
    value is num && value.isFinite && value >= 0 && value <= 1;
bool _finiteNonNegative(Object? value) =>
    value is num && value.isFinite && value >= 0;
List<String>? _stringList(Object? value) =>
    value is List<Object?> && value.every((item) => item is String)
    ? value.cast<String>()
    : null;

bool _sameOrderedStrings(List<String> left, List<String> right) =>
    left.length == right.length &&
    List.generate(
      left.length,
      (index) => index,
    ).every((index) => left[index] == right[index]);
