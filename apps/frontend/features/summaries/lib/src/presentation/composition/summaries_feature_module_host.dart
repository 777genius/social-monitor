import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/summaries_feature_page.dart';
import '../stores/summaries_review_store.dart';

class SummariesFeatureModuleHost extends StatefulWidget {
  const SummariesFeatureModuleHost({super.key});

  @override
  State<SummariesFeatureModuleHost> createState() =>
      _SummariesFeatureModuleHostState();
}

class _SummariesFeatureModuleHostState
    extends State<SummariesFeatureModuleHost> {
  SummariesReviewStore? _store;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_store != null) {
      return;
    }
    _store = ModuleProvider.of(
      context,
      listen: false,
    ).get<SummariesReviewStore>();
  }

  @override
  void dispose() {
    _store?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = _store;
    if (store == null) {
      return const SizedBox.shrink();
    }
    return SummariesFeaturePage(store: store);
  }
}
