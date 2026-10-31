import 'package:flutter/widgets.dart';

import '../pages/summaries_feature_page.dart';
import '../stores/summaries_review_store.dart';
import '../stores/top_posts_sort_store.dart';
import 'summaries_feature_module.dart';

class SummariesFeatureModuleHost extends StatefulWidget {
  const SummariesFeatureModuleHost({super.key, required this.module});

  final SummariesFeatureModule module;

  @override
  State<SummariesFeatureModuleHost> createState() =>
      _SummariesFeatureModuleHostState();
}

class _SummariesFeatureModuleHostState
    extends State<SummariesFeatureModuleHost> {
  late final SummariesReviewStore _store;
  late final TopPostsSortStore _topPostsSortStore;

  @override
  void initState() {
    super.initState();
    _store = widget.module.createStore();
    _topPostsSortStore = widget.module.createTopPostsSortStore();
  }

  @override
  void dispose() {
    _store.dispose();
    _topPostsSortStore.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SummariesFeaturePage(
    store: _store,
    topPostsSortStore: _topPostsSortStore,
  );
}
