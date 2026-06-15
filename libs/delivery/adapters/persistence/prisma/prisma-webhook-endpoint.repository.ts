import type { WebhookEndpoint } from '../../../domain';
import type {
  ListWebhookEndpointsQuery,
  ListWebhookEndpointsResult,
  WebhookEndpointRepositoryPort,
} from '../../../ports';
import type { PrismaDeliveryClient, PrismaWebhookEndpointWriteData } from './prisma-delivery-client';
import { webhookEndpointFromPrisma, webhookEndpointStatusToPrisma } from './prisma-delivery-records';

export class PrismaWebhookEndpointRepository implements WebhookEndpointRepositoryPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async save(endpoint: WebhookEndpoint): Promise<void> {
    const snapshot = endpoint.toSnapshot();
    const data: PrismaWebhookEndpointWriteData = {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      url: snapshot.url,
      eventTypes: snapshot.eventTypes,
      status: webhookEndpointStatusToPrisma(snapshot.status),
      secretKeyId: snapshot.secretKeyId,
      secretPreview: snapshot.secretPreview,
      createdAt: snapshot.createdAt,
      disabledAt: snapshot.disabledAt ?? null,
      quarantinedAt: snapshot.quarantinedAt ?? null,
      quarantineReason: snapshot.quarantineReason ?? null,
    };

    await this.prisma.webhookEndpoint.upsert({
      where: { id: snapshot.id },
      update: data,
      create: {
        id: snapshot.id,
        ...data,
      },
    });
  }

  async findById(
    params: Parameters<WebhookEndpointRepositoryPort['findById']>[0],
  ): Promise<WebhookEndpoint | null> {
    const record = await this.prisma.webhookEndpoint.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.webhookEndpointId,
      },
    });

    return record === null ? null : webhookEndpointFromPrisma(record);
  }

  async list(query: ListWebhookEndpointsQuery): Promise<ListWebhookEndpointsResult> {
    const offset = parseCursor(query.cursor);
    const take = Math.max(1, Math.min(query.limit, 100));
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
    };
    const [records, total] = await Promise.all([
      this.prisma.webhookEndpoint.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take,
      }),
      this.prisma.webhookEndpoint.count({ where }),
    ]);
    const nextOffset = offset + records.length;

    return {
      endpoints: records.map(webhookEndpointFromPrisma),
      nextCursor: nextOffset < total ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
