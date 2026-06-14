import { FixedClock, type IdGenerator, isOk, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Sha256ApiKeyHasher } from '../libs/identity/adapters/hash/hmac-api-key.hasher';
import { PrismaApiKeyRepository } from '../libs/identity/adapters/persistence/prisma/prisma-api-key.repository';
import type { PrismaIdentityClient } from '../libs/identity/adapters/persistence/prisma/prisma-identity-client';
import type {
  PrismaApiKeyCredentialRecord,
} from '../libs/identity/adapters/persistence/prisma/prisma-identity-records';
import { CreateApiKeyUseCase } from '../libs/identity/features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '../libs/identity/features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../libs/identity/features/revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from '../libs/identity/features/verify-api-key/verify-api-key.use-case';
import { resolveIdentityPersistenceMode } from '../libs/identity/interfaces/rest/identity-provider-tokens';

const clock = new FixedClock(new Date('2026-06-07T00:00:00.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000501');
const workspace = workspaceId('00000000-0000-7000-8000-000000000502');

async function main(): Promise<void> {
  assert(resolveIdentityPersistenceMode({}) === 'in-memory', 'identity persistence must default to in-memory');
  assertThrows(
    () => resolveIdentityPersistenceMode({ IDENTITY_PERSISTENCE: 'prisma' }),
    'IDENTITY_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveIdentityPersistenceMode({
      IDENTITY_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'identity persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaIdentityClient();
  const apiKeys = new PrismaApiKeyRepository(prisma);
  const hasher = new Sha256ApiKeyHasher();
  const ids = new SequenceIdGenerator([
    'secretpart01',
    'secretpart02',
    '00000000-0000-7000-8000-000000000503',
  ]);

  const created = await new CreateApiKeyUseCase(apiKeys, hasher, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'Automation Key',
    scopes: ['read:feed', 'read:summaries'],
  });
  assert(isOk(created), 'API key create must succeed through Prisma repository');

  const listed = await new ListApiKeysUseCase(apiKeys).execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(isOk(listed), 'API key list must succeed through Prisma repository');
  assert(listed.value.apiKeys.length === 1, 'API key list must return persisted key');
  const listedKey = listed.value.apiKeys[0];
  assert(listedKey !== undefined, 'API key list must return a concrete key view');
  assert(listedKey.keyPrefix === created.value.apiKey.keyPrefix, 'API key list must expose key prefix');
  assert(!Object.prototype.hasOwnProperty.call(listedKey, 'secretHash'), 'API key list must not expose secret hash');

  const verified = await new VerifyApiKeyUseCase(apiKeys, hasher).execute({
    secret: created.value.secret,
    requiredScope: 'read:feed',
  });
  assert(isOk(verified), 'API key verify must accept persisted active key');

  const forbiddenScope = await new VerifyApiKeyUseCase(apiKeys, hasher).execute({
    secret: created.value.secret,
    requiredScope: 'write:webhook_endpoints',
  });
  assert(!isOk(forbiddenScope), 'API key verify must reject missing scope');

  const revoked = await new RevokeApiKeyUseCase(apiKeys, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    apiKeyId: created.value.apiKey.id,
  });
  assert(isOk(revoked), 'API key revoke must persist terminal state');

  const rejectedAfterRevoke = await new VerifyApiKeyUseCase(apiKeys, hasher).execute({
    secret: created.value.secret,
    requiredScope: 'read:feed',
  });
  assert(!isOk(rejectedAfterRevoke), 'API key verify must reject revoked key');

  console.log('Identity Prisma persistence smoke OK');
}

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('SequenceIdGenerator exhausted');
    }

    this.index += 1;

    return value;
  }
}

class FakePrismaIdentityClient implements PrismaIdentityClient {
  private readonly apiKeys = new Map<string, PrismaApiKeyCredentialRecord>();

  readonly apiKeyCredential: PrismaIdentityClient['apiKeyCredential'] = {
    upsert: async (args) => {
      const existing = this.apiKeys.get(args.where.id);
      const record: PrismaApiKeyCredentialRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        name: args.update.name,
        keyPrefix: args.update.keyPrefix,
        secretHash: args.update.secretHash,
        scopes: args.update.scopes,
        status: args.update.status,
        createdAt: existing?.createdAt ?? args.create.createdAt,
        revokedAt: args.update.revokedAt ?? null,
      };
      this.apiKeys.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.apiKeys.values()].find((record) => matchesApiKeyWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.apiKeys.values()]
        .filter((record) => matchesApiKeyWhere(record, args.where))
        .sort(compareApiKeyRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) =>
      [...this.apiKeys.values()].filter((record) => matchesApiKeyWhere(record, args.where)).length,
  };
}

const matchesApiKeyWhere = (
  record: PrismaApiKeyCredentialRecord,
  where: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly id?: string;
    readonly keyPrefix?: string;
  },
): boolean =>
  (where.tenantId === undefined || record.tenantId === where.tenantId) &&
  (where.workspaceId === undefined || record.workspaceId === where.workspaceId) &&
  (where.id === undefined || record.id === where.id) &&
  (where.keyPrefix === undefined || record.keyPrefix === where.keyPrefix);

const compareApiKeyRecords = (
  left: PrismaApiKeyCredentialRecord,
  right: PrismaApiKeyCredentialRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(message);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
