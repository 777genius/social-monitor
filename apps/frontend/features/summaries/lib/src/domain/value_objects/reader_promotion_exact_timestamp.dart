/// Exact UTC instant of a reader promotion fact, with microsecond precision.
///
/// The backend signs timestamps as `YYYY-MM-DDTHH:MM:SS.ffffffZ`. Flutter web
/// keeps only milliseconds in [DateTime] and represents `int` as a JavaScript
/// double, so the instant is held as a [BigInt] count of microseconds:
/// milliseconds from the first 23 characters plus the last three digits.
/// This mirrors `timestampMicros` in
/// `libs/summary/domain/policies/reader-promotion-ranking.ts`.
final class ReaderPromotionExactTimestamp
    implements Comparable<ReaderPromotionExactTimestamp> {
  const ReaderPromotionExactTimestamp._(
    this.value,
    this.microsecondsSinceEpoch,
  );

  /// Returns `null` for anything but a canonical, calendar-valid timestamp.
  static ReaderPromotionExactTimestamp? tryParse(Object? value) {
    if (value is! String) return null;
    final match = _canonicalPattern.firstMatch(value);
    if (match == null) return null;
    final parts = [
      for (var group = 1; group <= 8; group += 1)
        int.parse(match.group(group)!),
    ];
    final instant = DateTime.utc(
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      parts[4],
      parts[5],
      parts[6],
    );
    // DateTime.utc silently rolls 2026-02-30 or 24:00 over; a signed
    // canonical timestamp never needs that, so a rollover is malformed.
    if (instant.year != parts[0] ||
        instant.month != parts[1] ||
        instant.day != parts[2] ||
        instant.hour != parts[3] ||
        instant.minute != parts[4] ||
        instant.second != parts[5]) {
      return null;
    }
    return ReaderPromotionExactTimestamp._(
      value,
      BigInt.from(instant.millisecondsSinceEpoch) * _microsPerMilli +
          BigInt.from(parts[7]),
    );
  }

  /// The signed canonical text, unchanged.
  final String value;
  final BigInt microsecondsSinceEpoch;

  /// Microseconds from [earlier] to this instant (negative when earlier).
  BigInt microsecondsSince(ReaderPromotionExactTimestamp earlier) =>
      microsecondsSinceEpoch - earlier.microsecondsSinceEpoch;

  @override
  int compareTo(ReaderPromotionExactTimestamp other) =>
      microsecondsSinceEpoch.compareTo(other.microsecondsSinceEpoch);

  @override
  bool operator ==(Object other) =>
      other is ReaderPromotionExactTimestamp &&
      other.microsecondsSinceEpoch == microsecondsSinceEpoch;

  @override
  int get hashCode => microsecondsSinceEpoch.hashCode;
}

final _canonicalPattern = RegExp(
  r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})(\d{3})Z$',
);
final _microsPerMilli = BigInt.from(1000);
