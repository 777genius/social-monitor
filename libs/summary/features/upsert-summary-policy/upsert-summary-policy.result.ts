import type { SummaryPolicyView } from '../shared/summary-policy-presenter';

export type UpsertSummaryPolicyResult = {
  readonly policy: SummaryPolicyView;
  readonly created: boolean;
};
