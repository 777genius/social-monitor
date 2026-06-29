import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/feed_feature_page.dart';
import '../stores/feed_items_store.dart';
import 'feed_feature_module.dart';

class FeedFeatureModuleHost extends StatefulWidget {
  const FeedFeatureModuleHost({super.key});

  @override
  State<FeedFeatureModuleHost> createState() => _FeedFeatureModuleHostState();
}

class _FeedFeatureModuleHostState extends State<FeedFeatureModuleHost> {
  FeedItemsStore? _store;
  FeedFeatureModule? _module;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_module != null) {
      return;
    }
    _module = ModuleProvider.moduleOf<FeedFeatureModule>(
      context,
      listen: false,
    );
    _store = ModuleProvider.of(context, listen: false).get<FeedItemsStore>();
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
    return FeedFeaturePage(
      store: store,
      interestTitle: _module?.initialInterestTitle,
    );
  }
}
