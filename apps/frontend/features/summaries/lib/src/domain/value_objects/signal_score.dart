final class SignalScore {
  const SignalScore._(this.value);

  factory SignalScore.normalized(double raw) {
    if (raw.isNaN || raw.isInfinite) {
      return const SignalScore._(0);
    }

    return SignalScore._(raw < 0 ? 0 : raw);
  }

  static const zero = SignalScore._(0);

  final double value;

  String toFixed(int fractionDigits) => value.toStringAsFixed(fractionDigits);

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SignalScore && other.value == value;

  @override
  int get hashCode => value.hashCode;
}
