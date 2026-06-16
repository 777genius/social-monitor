import type { SummaryPolicyView } from '../shared/summary-policy-presenter';

export type GetSummaryPolicyResult = {
  readonly policy: SummaryPolicyView;
  readonly source: 'stored' | 'default';
};
