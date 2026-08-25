import '../../domain/entities/top_read.dart';

/// Orders non-curated summary evidence by comparable usefulness signals.
///
/// Provider-native metrics are intentionally excluded: Reddit upvotes,
/// Hacker News points and X likes do not share a meaningful scale.
List<TopRead> orderMoreSelectedPostsByUsefulness(Iterable<TopRead> items) {
  final indexed = items.indexed.toList(growable: false);
  indexed.sort((left, right) {
    final usefulnessOrder = _compareUsefulness(left.$2, right.$2);
    return usefulnessOrder != 0 ? usefulnessOrder : left.$1.compareTo(right.$1);
  });
  return indexed.map((entry) => entry.$2).toList(growable: false);
}

int _compareUsefulness(TopRead left, TopRead right) {
  final signalOrder = right.signalScore.value.compareTo(left.signalScore.value);
  if (signalOrder != 0) {
    return signalOrder;
  }

  final confirmationOrder = _uniqueCount(
    right.confirmedProviderKeys,
  ).compareTo(_uniqueCount(left.confirmedProviderKeys));
  if (confirmationOrder != 0) {
    return confirmationOrder;
  }

  final confidenceLevelOrder = _confidenceLevel(
    right,
  ).compareTo(_confidenceLevel(left));
  if (confidenceLevelOrder != 0) {
    return confidenceLevelOrder;
  }

  final confidenceScoreOrder = _safeScore(
    right.confidence.score,
  ).compareTo(_safeScore(left.confidence.score));
  if (confidenceScoreOrder != 0) {
    return confidenceScoreOrder;
  }

  return _uniqueCount(
    right.matchedInterestIds,
  ).compareTo(_uniqueCount(left.matchedInterestIds));
}

int _confidenceLevel(TopRead item) =>
    switch (item.confidence.level.trim().toLowerCase()) {
      'high' => 3,
      'medium' => 2,
      'low' => 1,
      _ => 0,
    };

double _safeScore(double value) => value.isFinite ? value : 0;

int _uniqueCount(Iterable<String> values) => values
    .map((value) => value.trim().toLowerCase())
    .where((value) => value.isNotEmpty)
    .toSet()
    .length;
