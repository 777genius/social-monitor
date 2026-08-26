-- The corrected migration is accepted only by the one-time guarded transition.
SELECT social_monitor_telemetry_recovery.assert_guard();
SELECT social_monitor_telemetry_recovery.record_attestation('COMPLETE') AS case;
