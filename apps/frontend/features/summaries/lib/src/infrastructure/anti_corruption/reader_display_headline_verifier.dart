import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Verifies stored display identity only; the existing promotion verifier and
/// trusted artifact response remain required. Never creates headline authority.
bool verifyReaderDisplayHeadline({
  required Map<String, Object?> payload,
  required Object? headline,
  required Object? source,
  required Object? outerSeal,
  required String? title,
  required String? providerKey,
  required String? tenantId,
  required String? workspaceId,
  required String? sourceItemId,
  required String? sourceCandidateId,
}) {
  final seal = payload['displayHeadline'];
  if (seal == null && !payload.containsKey('displayHeadline') &&
      headline == null && source == null && outerSeal == null) {
    return true;
  }
  if (payload['schemaVersion'] != 'reader_post_promotion_attestation.v2' ||
      seal is! Map<String, Object?> ||
      headline is! Map<String, Object?> || source is! Map<String, Object?> ||
      !_keys(seal, {'headline', 'capturedSourceDigest'}) ||
      _canonical(seal) != _canonical(outerSeal) ||
      _canonical(seal['headline']) != _canonical(headline) ||
      !_keys(headline, {'status', 'kind', 'text', 'binding', 'support',
        'qualifications', 'confidence', 'wholeInput'}) ||
      headline['status'] != 'accepted' ||
      !{'claim', 'subject_label'}.contains(headline['kind']) ||
      headline['text'] != title || title == null || !_concise(title) ||
      !_keys(source, {'title', 'body', 'captureAvailability', 'reviewAvailability'}) ||
      source['title'] is! String || source['body'] is! String ||
      source['captureAvailability'] != 'available' ||
      seal['capturedSourceDigest'] != _digest(_canonical(source))) {
    return false;
  }
  final sourceTitle = source['title']! as String;
  final body = source['body']! as String;
  if (!_safeUtf16(sourceTitle) || !_safeUtf16(body) ||
      sourceTitle.length > 2000 || body.length > 12000) {
    return false;
  }
  final binding = headline['binding'];
  final whole = headline['wholeInput'];
  final confidence = headline['confidence'];
  if (binding is! Map<String, Object?> ||
      !_keys(binding, {'candidateId', 'providerKey', 'tenantId', 'workspaceId',
        'interestId', 'sourceBindingId', 'sourceItemId', 'trustedIntent',
        'availability', 'reviewedInputDigest'}) ||
      binding.values.any((v) => v is! String || v.trim().isEmpty) ||
      binding['candidateId'] != payload['candidateId'] ||
      binding['candidateId'] != sourceCandidateId ||
      binding['providerKey'] != providerKey ||
      binding['tenantId'] != tenantId || binding['workspaceId'] != workspaceId ||
      binding['sourceItemId'] != sourceItemId ||
      binding['availability'] != source['reviewAvailability'] ||
      !{'title_only', 'body_present'}.contains(binding['availability']) ||
      (binding['availability'] == 'title_only') != body.trim().isEmpty ||
      whole is! Map<String, Object?> ||
      !_keys(whole, {'titleLength', 'bodyLength', 'qualificationJudgment'}) ||
      whole['titleLength'] != sourceTitle.length || whole['bodyLength'] != body.length ||
      confidence is! num || !confidence.isFinite || confidence < .8 || confidence > 1) {
    return false;
  }
  // This digest uses the original JS object insertion order, not sorted keys.
  final reviewed = jsonEncode({
    'candidateId': binding['candidateId'], 'providerKey': binding['providerKey'],
    'context': {for (final key in ['tenantId', 'workspaceId', 'interestId',
      'sourceBindingId', 'sourceItemId', 'trustedIntent', 'availability']) key: binding[key]},
    'title': sourceTitle, 'body': body,
  });
  if (_digest(reviewed) != binding['reviewedInputDigest']) return false;
  final support = headline['support'];
  final qualifications = headline['qualifications'];
  if (!_references(support, sourceTitle, body) ||
      qualifications is! List<Object?> || qualifications.length > 8) {
    return false;
  }
  final phrases = <String>{};
  final references = <Map<String, Object?>>[];
  void collect(Object? value) {
    for (final ref in (value! as List<Object?>).cast<Map<String, Object?>>()) {
      references.add(ref);
    }
  }
  collect(support);
  for (final q in qualifications) {
    if (q is! Map<String, Object?> || !_keys(q, {'phrase', 'evidence'}) ||
        q['phrase'] is! String) {
      return false;
    }
    final phrase = q['phrase']! as String;
    if (!_concise(phrase) || !title.contains(phrase) || !phrases.add(phrase) ||
        !_references(q['evidence'], sourceTitle, body)) {
      return false;
    }
    collect(q['evidence']);
  }
  // Count serialized occurrences across roles; never deduplicate evidence.
  // String.length and jsonEncode retain JS UTF-16 quote accounting.
  final referenceQuotes = references.map((ref) => ref['quote']! as String);
  if (references.length > 8 ||
      referenceQuotes.any((quote) => quote.length > 256) ||
      referenceQuotes.fold<int>(0, (sum, quote) => sum + quote.length) > 512 ||
      referenceQuotes.fold<int>(0, (sum, quote) => sum + jsonEncode(quote).length) > 1024) {
    return false;
  }
  if (headline['kind'] == 'claim') {
    return whole['qualificationJudgment'] == (phrases.isEmpty ? 'none' : 'preserved');
  }
  final refs = (support! as List<Object?>).cast<Map<String, Object?>>();
  final quotes = refs.map((ref) => ref['quote']! as String).toList();
  return whole['qualificationJudgment'] == 'subject_only' && phrases.isEmpty &&
      quotes.length >= 2 && quotes.length <= 3 &&
      refs.every((ref) => _wholeSubjectToken(ref, sourceTitle, body)) &&
      RegExp(r'^\p{Lu}[\p{L}\p{M}\p{N}-]{1,39}$', unicode: true).hasMatch(quotes.first) &&
      {'benchmark', 'compiler', 'model', 'editor', 'API', 'release', 'safety', 'latency'}.contains(quotes.last) &&
      (quotes.length != 3 || RegExp(r'^v\d{1,3}(?:\.\d{1,3}){0,2}$').hasMatch(quotes[1])) &&
      title == '${quotes.join(' ')} discussion';
}

bool _references(Object? value, String title, String body) {
  if (value is! List<Object?> || value.isEmpty || value.length > 8) return false;
  final identities = <String>{};
  for (final ref in value) {
    if (ref is! Map<String, Object?> || !_keys(ref, {'field', 'start', 'end', 'quote'}) ||
        !{'title', 'bodyPreview'}.contains(ref['field']) ||
        ref['start'] is! num || ref['end'] is! num || ref['quote'] is! String) {
      return false;
    }
    final start = ref['start']! as num;
    final end = ref['end']! as num;
    final text = ref['field'] == 'title' ? title : body;
    if (!start.isFinite || !end.isFinite || start != start.toInt() || end != end.toInt() ||
        start < 0 || end <= start || end > text.length ||
        text.substring(start.toInt(), end.toInt()) != ref['quote'] ||
        !RegExp(r'\S', unicode: true).hasMatch(ref['quote']! as String) ||
        !_safeUtf16(ref['quote']! as String) ||
        !identities.add('${ref['field']}:$start:$end')) {
      return false;
    }
  }
  return true;
}

// Source offsets are UTF-16 units, but adjoining characters are code points.
// Keep this continuation class aligned with reader-post-display-headline.ts.
bool _wholeSubjectToken(Map<String, Object?> ref, String title, String body) {
  final text = ref['field'] == 'title' ? title : body;
  final before = text.substring(0, (ref['start']! as num).toInt()).runes;
  final after = text.substring((ref['end']! as num).toInt()).runes;
  final continuation = RegExp(
    r"[\p{L}\p{M}\p{N}\p{Pc}\p{Pd}\p{Cf}.+\u2212'’]",
    unicode: true,
  );
  return (before.isEmpty || !continuation.hasMatch(String.fromCharCode(before.last))) &&
      (after.isEmpty || !continuation.hasMatch(String.fromCharCode(after.first)));
}

bool _keys(Map<String, Object?> value, Set<String> keys) =>
    value.length == keys.length && keys.every(value.containsKey);
bool _concise(String text) => text.isNotEmpty && text.length <= 119 &&
    text == text.trim() && _safeUtf16(text) &&
    !RegExp(r'[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069<>]|https?://|\.\.\.|…').hasMatch(text);
bool _safeUtf16(String text) {
  for (var i = 0; i < text.length; i++) {
    final unit = text.codeUnitAt(i);
    if (unit == 0 || (unit >= 0xdc00 && unit <= 0xdfff)) return false;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (++i >= text.length) return false;
      final low = text.codeUnitAt(i);
      if (low < 0xdc00 || low > 0xdfff) return false;
    }
  }
  return true;
}
String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
String _canonical(Object? value) => jsonEncode(_sorted(value));
Object? _sorted(Object? value) {
  if (value is List<Object?>) return value.map(_sorted).toList();
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _sorted(value[key])};
  }
  return value;
}
