import type { DigestView } from '../shared/digest-presenter';

export type AssembleDigestResult = {
  readonly digest: DigestView;
  readonly created: boolean;
  readonly deliveryAttemptId?: string;
};
