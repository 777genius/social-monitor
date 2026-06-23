enum UserActionRisk { normal, expensive, destructive, credential }

final class UserActionIntent {
  const UserActionIntent({
    required this.id,
    this.risk = UserActionRisk.normal,
    this.disabledReasonCode,
    this.requiresConfirmation = false,
    this.idempotencyKey,
  });

  final String id;
  final UserActionRisk risk;
  final String? disabledReasonCode;
  final bool requiresConfirmation;
  final String? idempotencyKey;

  bool get isEnabled => disabledReasonCode == null;

  bool get isRisky => risk != UserActionRisk.normal;
}
