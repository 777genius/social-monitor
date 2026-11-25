import { validateOutboundUrl } from '@social-monitor/shared-kernel';

export const validateRedditTokenUrl = (value: string): string => {
  const result = validateOutboundUrl(value, {
    label: 'Reddit OAuth token URL',
    allowedProtocols: ['https:'],
  });

  if (!result.ok) {
    throw new Error(`Reddit OAuth token URL rejected: ${result.reason}`);
  }

  return result.url.toString();
};
