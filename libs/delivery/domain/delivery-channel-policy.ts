import type { DeliveryChannel } from './entities/delivery-attempt';

export const allDeliveryChannels = ['in_app', 'email', 'webhook'] as const satisfies readonly DeliveryChannel[];
export const betaDeliveryChannels = ['webhook'] as const satisfies readonly DeliveryChannel[];

export type DeliveryChannelPolicy = readonly DeliveryChannel[];

export const isDeliveryChannelSupported = (
  channel: DeliveryChannel,
  supportedChannels: DeliveryChannelPolicy = allDeliveryChannels,
): boolean => (supportedChannels as readonly string[]).includes(channel);
