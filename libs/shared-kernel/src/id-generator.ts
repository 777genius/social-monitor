export interface IdGenerator {
  generate(): string;
}

export class CryptoIdGenerator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}
