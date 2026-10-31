/// Reader-chosen display order of the ranked Top posts lanes.
///
/// It is a reader preference, not a ranking decision: it never changes lane
/// membership, the attested slots or the News without rating block.
enum TopPostsSortOrder {
  /// The authorized backend order (hybrid promotion score). The default.
  modelRank,

  /// Highest source engagement first; cards without a known metric follow in
  /// their model order.
  engagement,
}
