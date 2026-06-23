import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/topics_feature_page.dart';
import '../stores/topics_form_store.dart';
import '../stores/topics_list_store.dart';
import 'topics_feature_module.dart';

class TopicsFeatureModuleHost extends StatefulWidget {
  const TopicsFeatureModuleHost({super.key});

  @override
  State<TopicsFeatureModuleHost> createState() =>
      _TopicsFeatureModuleHostState();
}

class _TopicsFeatureModuleHostState extends State<TopicsFeatureModuleHost> {
  TopicsListStore? _store;
  TopicsFormStore? _formStore;
  TopicsFeatureModule? _module;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_store != null && _formStore != null && _module != null) {
      return;
    }
    final binder = ModuleProvider.of(context, listen: false);
    _store = binder.get<TopicsListStore>();
    _formStore = binder.get<TopicsFormStore>();
    _module = ModuleProvider.moduleOf<TopicsFeatureModule>(
      context,
      listen: false,
    );
  }

  @override
  void dispose() {
    _store?.dispose();
    _formStore?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = _store;
    final formStore = _formStore;
    final module = _module;
    if (store == null || formStore == null || module == null) {
      return const SizedBox.shrink();
    }
    return TopicsFeaturePage(
      store: store,
      formStore: formStore,
      showLifecycleFilters: module.showLifecycleFilters,
      showEditArchiveActions: module.showEditArchiveActions,
      onOpenTopicSources: module.onOpenTopicSources,
    );
  }
}
