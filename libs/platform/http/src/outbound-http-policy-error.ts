/** A deterministic egress-policy rejection, safe to expose without a target URL. */
export class OutboundHttpPolicyError extends Error {
  readonly retryable = false;

  constructor(readonly reasonCode: string, message: string) {
    super(message);
  }
}
