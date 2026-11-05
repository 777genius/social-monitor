import 'dart:convert';

/// Canonical promotion JSON, byte-identical to the backend
/// `canonicalPromotionPayload`: `JSON.stringify` of the value with object
/// keys sorted recursively.
///
/// - Keys sort by UTF-16 code units. The backend sorts with `localeCompare`,
///   which agrees for the ASCII camelCase and snake_case keys of the signed
///   contract; any other key makes verification fail closed, because the
///   signed bytes then differ.
/// - Integral doubles serialize like JavaScript numbers: `984`, never
///   `984.0`, and `0` for `-0.0`. The Dart VM and Flutter web, where every
///   number is a JavaScript double, therefore produce the same bytes.
String readerPromotionCanonicalJson(Object? value) =>
    jsonEncode(_canonicalValue(value, dropNulls: false));

/// Canonical form for comparing an independently transported copy of a
/// signed object. Generated transport DTOs serialize absent optional fields
/// as `null`, so null members are dropped on both sides before comparing.
/// Nested transport objects are first reduced to plain JSON.
String readerPromotionTransportJson(Object? value) =>
    jsonEncode(_canonicalValue(jsonDecode(jsonEncode(value)), dropNulls: true));

Object? _canonicalValue(Object? value, {required bool dropNulls}) {
  if (value is List<Object?>) {
    return [
      for (final item in value) _canonicalValue(item, dropNulls: dropNulls),
    ];
  }
  if (value is Map<String, Object?>) {
    final keys =
        value.keys
            .where((key) => !dropNulls || value[key] != null)
            .toList(growable: false)
          ..sort();
    return <String, Object?>{
      for (final key in keys)
        key: _canonicalValue(value[key], dropNulls: dropNulls),
    };
  }
  if (value is double &&
      value.isFinite &&
      value == value.truncateToDouble() &&
      value.abs() <= _maxExactInteger) {
    return value.toInt();
  }
  return value;
}

/// 2^53: every integral double up to this magnitude converts exactly.
const _maxExactInteger = 9007199254740992;
