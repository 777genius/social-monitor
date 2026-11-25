import 'user_action_intent.dart';

sealed class AccessUxState {
  const AccessUxState();
}

final class AccessReady extends AccessUxState {
  const AccessReady();
}

final class SignedOutAccess extends AccessUxState {
  const SignedOutAccess({required this.repairAction});

  final UserActionIntent repairAction;
}

final class WorkspaceMissingAccess extends AccessUxState {
  const WorkspaceMissingAccess({required this.repairAction});

  final UserActionIntent repairAction;
}

final class PermissionRequiredAccess extends AccessUxState {
  const PermissionRequiredAccess({
    required this.permissionKey,
    required this.disabledReasonCode,
    required this.repairAction,
  });

  final String permissionKey;
  final String disabledReasonCode;
  final UserActionIntent repairAction;
}

final class CredentialExpiredAccess extends AccessUxState {
  const CredentialExpiredAccess({required this.repairAction});

  final UserActionIntent repairAction;
}

final class SourceDisconnectedAccess extends AccessUxState {
  const SourceDisconnectedAccess({required this.repairAction});

  final UserActionIntent repairAction;
}
