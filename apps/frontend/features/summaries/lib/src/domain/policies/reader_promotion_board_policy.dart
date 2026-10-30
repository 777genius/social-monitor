import '../value_objects/reader_promotion_comparator.dart';
import 'reader_promotion_ranking_policy.dart';

/// One promoted card on the board: its story and its signed comparator.
final class ReaderPromotionBoardEntry {
  const ReaderPromotionBoardEntry({
    required this.storyId,
    required this.comparator,
  });

  final String storyId;
  final ReaderPromotionComparator comparator;
}

/// Independent client check of a published reader promotion board.
///
/// It recomputes everything from the signed comparators, never from card
/// fields, the same way `assertReaderPromotionAttestations` does on the
/// backend:
///
/// - sizes: Top at most 12, Top + Show more at most 48, Show more only behind
///   a full Top, news at most 16; there is no per-network count;
/// - blocks: Top and Show more are ranked, news is unranked;
/// - admission, metric maturity and popularity presence, including the
///   minimum popularity cohort;
/// - order: Top then Show more is one ranked sequence, news a second one;
/// - one story per page and one real publisher per news block;
/// - popularity cohorts: one cohort size per family and no larger metric
///   below a smaller one.
bool readerPromotionBoardIsConsistent({
  required List<ReaderPromotionBoardEntry> top,
  required List<ReaderPromotionBoardEntry> additional,
  required List<ReaderPromotionBoardEntry> news,
}) {
  if (top.length > ReaderPromotionLimits.top ||
      top.length + additional.length > ReaderPromotionLimits.rankedTotal ||
      (additional.isNotEmpty && top.length != ReaderPromotionLimits.top) ||
      news.length > ReaderPromotionLimits.news) {
    return false;
  }
  final ranked = [...top, ...additional];
  final all = [...ranked, ...news];
  return ranked.every(
        (entry) => entry.comparator.block == ReaderPromotionBlock.ranked,
      ) &&
      news.every(
        (entry) => entry.comparator.block == ReaderPromotionBlock.unranked,
      ) &&
      all.every(
        (entry) =>
            readerPromotionSemanticallyAdmitted(entry.comparator) &&
            readerPromotionComparatorIsCoherent(entry.comparator),
      ) &&
      _ordered(ranked, compareRankedReaderPromotion) &&
      _ordered(news, compareUnrankedReaderPromotion) &&
      _uniqueOnPage(all) &&
      _coherentPopularityCohorts(all);
}

bool _ordered(
  List<ReaderPromotionBoardEntry> lane,
  int Function(ReaderPromotionComparator, ReaderPromotionComparator) compare,
) {
  for (var index = 1; index < lane.length; index += 1) {
    if (compare(lane[index - 1].comparator, lane[index].comparator) > 0) {
      return false;
    }
  }
  return true;
}

bool _uniqueOnPage(List<ReaderPromotionBoardEntry> all) {
  final publishers = [for (final entry in all) ?entry.comparator.newsPublisher];
  return all.map((entry) => entry.storyId).toSet().length == all.length &&
      all.map((entry) => entry.comparator.candidateId).toSet().length ==
          all.length &&
      publishers.toSet().length == publishers.length;
}

/// Mature members of one family either all carry popularity or, below the
/// minimum cohort, all carry none. Members with popularity share a cohort
/// size, a larger metric never sits below a smaller one, and equal metrics
/// carry equal counts.
bool _coherentPopularityCohorts(List<ReaderPromotionBoardEntry> all) {
  final familiesWithoutPopularity = {
    for (final entry in all)
      if (entry.comparator.metricMature && entry.comparator.popularity == null)
        entry.comparator.providerFamily,
  };
  final byFamily = <String, List<ReaderPromotionComparator>>{};
  for (final entry in all) {
    if (entry.comparator.popularity == null) continue;
    if (familiesWithoutPopularity.contains(entry.comparator.providerFamily)) {
      return false;
    }
    byFamily
        .putIfAbsent(entry.comparator.providerFamily, () => [])
        .add(entry.comparator);
  }
  for (final members in byFamily.values) {
    if (members.length > members.first.popularity!.cohortSize) return false;
    for (final left in members) {
      for (final right in members) {
        final l = left.popularity!;
        final r = right.popularity!;
        final leftValue = left.engagement!.value;
        final rightValue = right.engagement!.value;
        final consistent =
            l.cohortSize == r.cohortSize &&
            (leftValue > rightValue
                ? l.below >= r.below + r.equal
                : leftValue != rightValue ||
                      (l.below == r.below && l.equal == r.equal));
        if (!consistent) return false;
      }
    }
  }
  return true;
}
