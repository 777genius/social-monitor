export type VerifyWebhookSignatureResult = {
  readonly verified: boolean;
  readonly reason?: 'invalid_signature' | 'invalid_timestamp' | 'replay_detected' | 'secret_unavailable';
};
