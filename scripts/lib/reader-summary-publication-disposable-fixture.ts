/** Fixture provenance is the provisioning callback lifetime, not database catalog output. */
export type ProvisionedPublicationFixture = Readonly<{
  databaseName: string;
  runtimeDatabaseUrl: string;
  auditorDatabaseUrl: string;
}>;

const active = new WeakMap<ProvisionedPublicationFixture, string>();
const revocations = new WeakMap<ProvisionedPublicationFixture, Set<() => Promise<void>>>();

export async function withProvisionedPublicationFixture<T>(
  fixture: ProvisionedPublicationFixture,
  callback: (fixture: ProvisionedPublicationFixture) => Promise<T> | T,
): Promise<T> {
  const owned = Object.freeze({ ...fixture });
  active.set(owned, fixture.runtimeDatabaseUrl);
  revocations.set(owned, new Set());
  try { return await callback(owned); }
  finally {
    active.delete(owned);
    const pending = revocations.get(owned);
    revocations.delete(owned);
    if (pending !== undefined) await Promise.all([...pending].map((revoke) => revoke()));
  }
}

export function disposablePublicationFixtureRuntimeUrl(fixture: ProvisionedPublicationFixture): string {
  const url = fixture !== null && typeof fixture === "object" ? active.get(fixture) : undefined;
  if (url === undefined) throw new Error("Synthetic recovery requires an active provisioned fixture");
  return url;
}

export function registerPublicationFixtureRevocation(
  fixture: ProvisionedPublicationFixture, revoke: () => Promise<void>,
): void {
  disposablePublicationFixtureRuntimeUrl(fixture);
  revocations.get(fixture)?.add(revoke);
}
