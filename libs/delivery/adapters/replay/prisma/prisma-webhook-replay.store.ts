import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { WebhookReplayStorePort } from '../../../ports';
import type { PrismaDeliveryClient } from '../../persistence/prisma/prisma-delivery-client';

export class PrismaWebhookReplayStore implements WebhookReplayStorePort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async rememberDelivery(params: {
    readonly webhookEndpointId: string;
    readonly deliveryId: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<boolean> {
    const where = {
      webhookEndpointId_deliveryId: {
        webhookEndpointId: params.webhookEndpointId,
        deliveryId: params.deliveryId,
      },
    };
    const existing = await this.prisma.webhookReplayDelivery.findUnique({ where });

    if (existing !== null) {
      if (existing.expiresAt.getTime() > params.now.getTime()) {
        return false;
      }

      await withPrismaWriteRetry(() => this.prisma.webhookReplayDelivery.update({
        where,
        data: {
          rememberedAt: params.now,
          expiresAt: params.expiresAt,
        },
      }));

      return true;
    }

    try {
      await withPrismaWriteRetry(() => this.prisma.webhookReplayDelivery.create({
        data: {
          webhookEndpointId: params.webhookEndpointId,
          deliveryId: params.deliveryId,
          rememberedAt: params.now,
          expiresAt: params.expiresAt,
        },
      }));
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return false;
      }

      throw error;
    }

    return true;
  }
}

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  return (error as { readonly code?: unknown }).code === 'P2002';
};
