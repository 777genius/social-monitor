part of 'reader_summary_brief_surface.dart';

const _topicMapClusterMaximumSurfaceGap = 18.0;
const _topicMapClusterTargetSurfaceGap = 9.0;

List<_TopicGraphBubble> _resolveBubbleCollisions(
  List<_TopicGraphBubble> bubbles,
  Size graphSize,
) {
  final centers = bubbles.map((bubble) => bubble.center).toList();
  final groupedIndexes = <String, List<int>>{};
  for (var index = 0; index < bubbles.length; index++) {
    final groupId = bubbles[index].group.id;
    if (groupId == _topicMapNeutralGroupId) {
      continue;
    }
    groupedIndexes.putIfAbsent(groupId, () => []).add(index);
  }
  final cohesiveGroupIds = {
    for (final entry in groupedIndexes.entries)
      if (entry.value.length > 1) entry.key,
  };

  for (var pass = 0; pass < 36; pass++) {
    _applyTopicGroupCohesion(
      centers: centers,
      bubbles: bubbles,
      groupedIndexes: groupedIndexes,
      graphSize: graphSize,
    );
    _resolveTopicMapCollisionPass(
      centers: centers,
      bubbles: bubbles,
      cohesiveGroupIds: cohesiveGroupIds,
      graphSize: graphSize,
      preserveCohesiveGroups: true,
      reverseOrder: pass.isOdd,
    );
  }

  // Cross-group collisions can split a semantic group. Reconnect only the
  // detached components, then let the regular circle solver remove overlaps.
  for (var pass = 0; pass < 480; pass++) {
    final reconnected = _reconnectDetachedTopicGroupComponents(
      centers: centers,
      bubbles: bubbles,
      groupedIndexes: groupedIndexes,
      graphSize: graphSize,
    );
    final maxOverlap = _resolveTopicMapCollisionPass(
      centers: centers,
      bubbles: bubbles,
      cohesiveGroupIds: cohesiveGroupIds,
      graphSize: graphSize,
      preserveCohesiveGroups: false,
      reverseOrder: pass.isOdd,
    );
    if (!reconnected && maxOverlap <= 0.05) {
      break;
    }
  }

  return [
    for (var index = 0; index < bubbles.length; index++)
      bubbles[index].copyWithCenter(centers[index]),
  ];
}

double _resolveTopicMapCollisionPass({
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
  required Set<String> cohesiveGroupIds,
  required Size graphSize,
  required bool preserveCohesiveGroups,
  required bool reverseOrder,
}) {
  var maxOverlap = 0.0;
  final indexes = List.generate(
    bubbles.length,
    (index) => reverseOrder ? bubbles.length - index - 1 : index,
  );
  for (var leftPosition = 0; leftPosition < indexes.length; leftPosition++) {
    final left = indexes[leftPosition];
    for (
      var rightPosition = leftPosition + 1;
      rightPosition < indexes.length;
      rightPosition++
    ) {
      final right = indexes[rightPosition];
      final delta = centers[right] - centers[left];
      final distance = math.max(0.001, delta.distance);
      final sameCohesiveGroup =
          bubbles[left].group.id == bubbles[right].group.id &&
          cohesiveGroupIds.contains(bubbles[left].group.id);
      final visualGap = sameCohesiveGroup ? 8.0 : 0.8;
      final overlap =
          bubbles[left].radius + bubbles[right].radius + visualGap - distance;
      if (overlap <= 0) {
        continue;
      }
      maxOverlap = math.max(maxOverlap, overlap);
      final direction = distance > 0.01
          ? delta / distance
          : _collisionFallbackDirection(left, right);
      final leftCohesive = cohesiveGroupIds.contains(bubbles[left].group.id);
      final rightCohesive = cohesiveGroupIds.contains(bubbles[right].group.id);
      final (leftShare, rightShare) = preserveCohesiveGroups
          ? switch ((leftCohesive, rightCohesive)) {
              (true, false) => (0.0, 1.0),
              (false, true) => (1.0, 0.0),
              _ => (0.5, 0.5),
            }
          : (0.5, 0.5);
      centers[left] = _clampBubbleCenter(
        centers[left] - direction * overlap * leftShare,
        bubbles[left].radius,
        graphSize,
      );
      centers[right] = _clampBubbleCenter(
        centers[right] + direction * overlap * rightShare,
        bubbles[right].radius,
        graphSize,
      );
    }
  }

  return maxOverlap;
}

bool _reconnectDetachedTopicGroupComponents({
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
  required Map<String, List<int>> groupedIndexes,
  required Size graphSize,
}) {
  var moved = false;
  for (final indexes in groupedIndexes.values) {
    final components = _topicGroupSpatialComponents(
      indexes: indexes,
      centers: centers,
      bubbles: bubbles,
    );
    if (components.length < 2) {
      continue;
    }
    components.sort(
      (left, right) => _topicComponentWeight(
        right,
        bubbles,
      ).compareTo(_topicComponentWeight(left, bubbles)),
    );
    final anchor = components.first;
    for (final component in components.skip(1)) {
      final pair = _closestTopicComponentPair(
        source: component,
        target: anchor,
        centers: centers,
        bubbles: bubbles,
      );
      final delta = centers[pair.target] - centers[pair.source];
      if (delta.distance <= 0.01) {
        continue;
      }
      final distance = math.min(
        10.0,
        math.max(1.0, pair.surfaceGap - _topicMapClusterTargetSurfaceGap),
      );
      final translation = _boundedTopicMapUnitTranslation(
        centers: centers,
        bubbles: bubbles,
        indexes: component,
        graphSize: graphSize,
        requested: delta / delta.distance * distance,
      );
      for (final index in component) {
        centers[index] += translation;
      }
      moved = moved || translation.distance > 0.01;
    }
  }

  return moved;
}

List<List<int>> _topicGroupSpatialComponents({
  required List<int> indexes,
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
}) {
  final remaining = indexes.toSet();
  final components = <List<int>>[];
  while (remaining.isNotEmpty) {
    final component = <int>[];
    final pending = <int>[remaining.first];
    remaining.remove(pending.first);
    while (pending.isNotEmpty) {
      final current = pending.removeLast();
      component.add(current);
      for (final candidate in remaining.toList(growable: false)) {
        if (_topicBubbleSurfaceGap(current, candidate, centers, bubbles) <=
            _topicMapClusterMaximumSurfaceGap) {
          remaining.remove(candidate);
          pending.add(candidate);
        }
      }
    }
    components.add(component);
  }

  return components;
}

double _topicComponentWeight(
  List<int> indexes,
  List<_TopicGraphBubble> bubbles,
) => indexes.fold(
  0,
  (sum, index) => sum + bubbles[index].radius * bubbles[index].radius,
);

({int source, int target, double surfaceGap}) _closestTopicComponentPair({
  required List<int> source,
  required List<int> target,
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
}) {
  var closestSource = source.first;
  var closestTarget = target.first;
  var closestGap = double.infinity;
  for (final sourceIndex in source) {
    for (final targetIndex in target) {
      final gap = _topicBubbleSurfaceGap(
        sourceIndex,
        targetIndex,
        centers,
        bubbles,
      );
      if (gap < closestGap) {
        closestSource = sourceIndex;
        closestTarget = targetIndex;
        closestGap = gap;
      }
    }
  }

  return (source: closestSource, target: closestTarget, surfaceGap: closestGap);
}

double _topicBubbleSurfaceGap(
  int left,
  int right,
  List<Offset> centers,
  List<_TopicGraphBubble> bubbles,
) =>
    (centers[left] - centers[right]).distance -
    bubbles[left].radius -
    bubbles[right].radius;

Offset _boundedTopicMapUnitTranslation({
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
  required List<int> indexes,
  required Size graphSize,
  required Offset requested,
}) {
  var minimumDx = double.negativeInfinity;
  var maximumDx = double.infinity;
  var minimumDy = double.negativeInfinity;
  var maximumDy = double.infinity;
  for (final index in indexes) {
    final radius = bubbles[index].radius;
    minimumDx = math.max(minimumDx, radius + 6 - centers[index].dx);
    maximumDx = math.min(
      maximumDx,
      graphSize.width - radius - 6 - centers[index].dx,
    );
    minimumDy = math.max(minimumDy, radius + 6 - centers[index].dy);
    maximumDy = math.min(
      maximumDy,
      graphSize.height - radius - 6 - centers[index].dy,
    );
  }

  return Offset(
    requested.dx.clamp(minimumDx, maximumDx).toDouble(),
    requested.dy.clamp(minimumDy, maximumDy).toDouble(),
  );
}

void _applyTopicGroupCohesion({
  required List<Offset> centers,
  required List<_TopicGraphBubble> bubbles,
  required Map<String, List<int>> groupedIndexes,
  required Size graphSize,
}) {
  for (final indexes in groupedIndexes.values) {
    if (indexes.length < 2) {
      continue;
    }
    var weightedCenter = Offset.zero;
    var totalWeight = 0.0;
    for (final index in indexes) {
      final weight = math.max(
        1.0,
        bubbles[index].radius * bubbles[index].radius,
      );
      weightedCenter += centers[index] * weight;
      totalWeight += weight;
    }
    weightedCenter /= totalWeight;

    for (final index in indexes) {
      final bubble = bubbles[index];
      centers[index] = _clampBubbleCenter(
        Offset.lerp(centers[index], weightedCenter, 0.14) ?? centers[index],
        bubble.radius,
        graphSize,
      );
    }
  }
}

Offset _collisionFallbackDirection(int left, int right) {
  final angle = ((left + 1) * 37 + (right + 1) * 61) * math.pi / 180;

  return Offset(math.cos(angle), math.sin(angle));
}
