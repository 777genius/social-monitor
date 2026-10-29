part of 'reader_post_promotion_attestation_verifier.dart';

/// Recomputes, for one V3 attestation, everything its signed comparator
/// claims about itself: registry family and block, lane, semantic gate,
/// metric maturity, popularity presence, news publisher and the card Signal.
/// No card field is trusted as ordering input; the card Signal is only bound
/// to the comparator. Mirrors `comparatorIsConsistent` in
/// `libs/summary/domain/entities/reader-summary-promotion-order-validation.ts`.
///
/// Order, story uniqueness and popularity cohorts span the whole board and
/// are checked by `readerPromotionBoardIsConsistent` in the mapper.
ReaderPromotionComparator? _verifiedV3Comparator({
  required Map<String, Object?> decoded,
  required Map<String, Object?> comparator,
  required Map<String, Object?> answers,
  required Object? capturedSource,
  required num? cardSignalScore,
}) {
  final value = decodeReaderPromotionComparator(comparator);
  final provider = decoded['provider'];
  final canonicalIdentity = decoded['canonicalIdentity'];
  if (value == null ||
      provider is! String ||
      canonicalIdentity is! String ||
      cardSignalScore == null) {
    return null;
  }
  final source = readerPromotionSourceForProviderKey(provider);
  if (source == null) return null;
  final unranked = value.block == ReaderPromotionBlock.unranked;
  final expectedPublisher = unranked
      ? readerPromotionNewsPublisher(
          canonicalIdentity: canonicalIdentity,
          title: _capturedSourceTitle(capturedSource),
        )
      : null;
  final consistent =
      value.providerFamily == source.family &&
      value.block == source.block &&
      unranked == (decoded['placement'] == 'news') &&
      comparator['usefulness'] == _choice(answers['usefulness']) &&
      comparator['relevance'] == _choice(answers['relevance']) &&
      readerPromotionSemanticallyAdmitted(value) &&
      comparator['publishedAt'] == decoded['publishedAt'] &&
      value.candidateId == decoded['candidateId'] &&
      readerPromotionComparatorIsCoherent(value) &&
      value.newsPublisher == expectedPublisher &&
      cardSignalScore == readerPromotionCardSignalScore(value);
  return consistent ? value : null;
}

/// The backend reads the publisher from the captured source title
/// (`card.capturedSource?.title ?? ""`), never from the display headline.
String _capturedSourceTitle(Object? capturedSource) => switch (capturedSource) {
  {'title': final String title} => title,
  _ => '',
};
