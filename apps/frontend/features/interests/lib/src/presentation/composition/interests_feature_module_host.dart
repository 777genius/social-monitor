import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/interests_feature_page.dart';
import '../stores/interests_form_store.dart';
import '../stores/interests_list_store.dart';
import 'interests_feature_module.dart';

class InterestsFeatureModuleHost extends StatefulWidget {
  const InterestsFeatureModuleHost({super.key});

  @override
  State<InterestsFeatureModuleHost> createState() =>
      _InterestsFeatureModuleHostState();
}

class _InterestsFeatureModuleHostState
    extends State<InterestsFeatureModuleHost> {
  InterestsListStore? _store;
  InterestsFormStore? _formStore;
  InterestsFeatureModule? _module;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_store != null && _formStore != null && _module != null) {
      return;
    }
    final binder = ModuleProvider.of(context, listen: false);
    _store = binder.get<InterestsListStore>();
    _formStore = binder.get<InterestsFormStore>();
    _module = ModuleProvider.moduleOf<InterestsFeatureModule>(
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
    return InterestsFeaturePage(
      store: store,
      formStore: formStore,
      showLifecycleFilters: module.showLifecycleFilters,
      showEditArchiveActions: module.showEditArchiveActions,
      onOpenInterestSources: module.onOpenInterestSources,
    );
  }
}
