import 'package:flutter/widgets.dart';

import '../pages/published_summary_page.dart';
import '../stores/published_summary_store.dart';
import 'published_summaries_feature_module.dart';

class PublishedSummariesFeatureModuleHost extends StatefulWidget {
  const PublishedSummariesFeatureModuleHost({super.key, required this.module});

  final PublishedSummariesFeatureModule module;

  @override
  State<PublishedSummariesFeatureModuleHost> createState() =>
      _PublishedSummariesFeatureModuleHostState();
}

class _PublishedSummariesFeatureModuleHostState
    extends State<PublishedSummariesFeatureModuleHost> {
  late final PublishedSummaryStore _store;

  @override
  void initState() {
    super.initState();
    _store = widget.module.createStore();
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PublishedSummaryPage(store: _store);
}
