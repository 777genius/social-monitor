import 'package:flutter/widgets.dart';

import '../../application/use_cases/restore_session_use_case.dart';
import '../../application/use_cases/select_workspace_use_case.dart';
import '../../infrastructure/repositories/demo_session_gateway.dart';
import '../pages/auth_feature_page.dart';
import '../stores/auth_bootstrap_store.dart';

class AuthFeatureModuleHost extends StatefulWidget {
  const AuthFeatureModuleHost({super.key});

  @override
  State<AuthFeatureModuleHost> createState() => _AuthFeatureModuleHostState();
}

class _AuthFeatureModuleHostState extends State<AuthFeatureModuleHost> {
  late final AuthBootstrapStore _store;

  @override
  void initState() {
    super.initState();
    final gateway = DemoSessionGateway();
    _store = AuthBootstrapStore(
      restoreSession: RestoreSessionUseCase(gateway),
      selectWorkspace: SelectWorkspaceUseCase(gateway),
    );
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthFeaturePage(store: _store);
  }
}
