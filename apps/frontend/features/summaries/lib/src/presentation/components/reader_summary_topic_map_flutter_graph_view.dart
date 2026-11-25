part of 'reader_summary_brief_surface.dart';

const _topicMapFlutterGraphSettleDelay = Duration(milliseconds: 240);
const _topicMapFlutterGraphKey = ValueKey('topic-map-flutter-graph-view');

class _TopicMapFlutterGraphView extends StatefulWidget {
  const _TopicMapFlutterGraphView({
    required this.topicMap,
    required this.selection,
    required this.graphSize,
    required this.textColor,
    required this.mutedColor,
    required this.borderColor,
  });

  final ReaderSummaryTopicMap topicMap;
  final _TopicMapVisibleSelection selection;
  final Size graphSize;
  final Color textColor;
  final Color mutedColor;
  final Color borderColor;

  @override
  State<_TopicMapFlutterGraphView> createState() =>
      _TopicMapFlutterGraphViewState();
}

class _TopicMapFlutterGraphViewState extends State<_TopicMapFlutterGraphView> {
  flutter_graph_view.Options? _options;
  String? _signature;
  Timer? _settleTimer;

  @override
  void dispose() {
    _settleTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final model = _TopicMapFlutterGraphData.fromTopicMap(
      topicMap: widget.topicMap,
      selection: widget.selection,
      graphSize: widget.graphSize,
    );

    if (model.vertices.isEmpty) {
      return Center(
        child: Text(
          'No topic map data',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: widget.mutedColor,
            letterSpacing: 0,
          ),
        ),
      );
    }

    final options = _optionsFor(model);
    final algorithm = _algorithmFor();

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
          border: Border.all(color: widget.borderColor.withValues(alpha: 0.52)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: RepaintBoundary(
          key: _topicMapFlutterGraphKey,
          child: flutter_graph_view.FlutterGraphWidget(
            key: ValueKey(model.signature),
            data: model,
            convertor: _TopicMapFlutterGraphConvertor(),
            algorithm: algorithm,
            options: options,
          ),
        ),
      ),
    );
  }

  flutter_graph_view.Options _optionsFor(_TopicMapFlutterGraphData model) {
    if (_signature == model.signature && _options != null) {
      return _options!;
    }

    _signature = model.signature;
    final options = flutter_graph_view.Options()
      ..enableHit = true
      ..showText = false
      ..panelDelay = const Duration(milliseconds: 420)
      ..horizontalPanelVisible.value = false
      ..verticalControllerVisible.value = false
      ..zoomPerScrollUnit = 0
      ..scaleRange = flutter_graph_view.Vector2(0.9, 1.45)
      ..backgroundBuilder = ((_) => const SizedBox.expand())
      ..graphStyle = (flutter_graph_view.GraphStyle()
        ..tagColor = {
          for (final vertex in model.vertices) vertex.group.id: vertex.color,
        })
      ..vertexShape = _TopicMapFlutterGraphNodeShape(
        textColor: widget.textColor,
        borderColor: widget.borderColor,
      )
      ..edgeShape = _TopicMapFlutterGraphEdgeShape()
      ..vertexPanelBuilder = _topicMapFlutterGraphVertexPanel;

    _options = options;
    _scheduleSettlePause(options);

    return options;
  }

  void _scheduleSettlePause(flutter_graph_view.Options options) {
    _settleTimer?.cancel();
    options.pause.value = false;
    _settleTimer = Timer(_topicMapFlutterGraphSettleDelay, () {
      if (!mounted) {
        return;
      }
      options.pause.value = true;
    });
  }
}

flutter_graph_view.GraphAlgorithm _algorithmFor() {
  return flutter_graph_view.RandomAlgorithm();
}
