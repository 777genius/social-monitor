import { type OutboundUrlPolicyResult, validateOutboundUrl } from '@social-monitor/shared-kernel';

export type FeedUrlPolicyResult = OutboundUrlPolicyResult;

export const validateFeedUrl = (value: string): FeedUrlPolicyResult => {
  return validateOutboundUrl(value, {
    label: 'Feed URL',
    allowedProtocols: ['http:', 'https:'],
  });
};
