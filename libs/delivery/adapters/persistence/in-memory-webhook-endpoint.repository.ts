import type { WebhookEndpoint } from '../../domain';
import type {
  ListWebhookEndpointsQuery,
  ListWebhookEndpointsResult,
  WebhookEndpointRepositoryPort,
} from '../../ports';

export class InMemoryWebhookEndpointRepository implements WebhookEndpointRepositoryPort {
  private readonly endpointsById = new Map<string, WebhookEndpoint>();

  async save(endpoint: WebhookEndpoint): Promise<void> {
    const snapshot = endpoint.toSnapshot();

    this.endpointsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, endpoint);
  }

  async findById(params: Parameters<WebhookEndpointRepositoryPort['findById']>[0]): Promise<WebhookEndpoint | null> {
    return this.endpointsById.get(`${params.tenantId}:${params.workspaceId}:${params.webhookEndpointId}`) ?? null;
  }

  async list(query: ListWebhookEndpointsQuery): Promise<ListWebhookEndpointsResult> {
    const offset = parseCursor(query.cursor);
    const allEndpoints = [...this.endpointsById.values()]
      .filter((endpoint) => {
        const snapshot = endpoint.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareWebhookEndpoints);
    const endpoints = allEndpoints.slice(offset, offset + query.limit);
    const nextOffset = offset + endpoints.length;

    return {
      endpoints,
      nextCursor: nextOffset < allEndpoints.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareWebhookEndpoints = (left: WebhookEndpoint, right: WebhookEndpoint): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

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
