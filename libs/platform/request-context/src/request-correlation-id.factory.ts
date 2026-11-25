import { Inject, Injectable, Optional } from '@nestjs/common';
import { CryptoIdGenerator, type IdGenerator } from '@social-monitor/shared-kernel';

import { normalizeRequestContextId } from './request-context';

const defaultCorrelationIdGenerator = new CryptoIdGenerator();

export const REQUEST_CORRELATION_ID_GENERATOR = Symbol('REQUEST_CORRELATION_ID_GENERATOR');

export const resolveRequestCorrelationId = (
  requestId: string | undefined,
  idGenerator: IdGenerator = defaultCorrelationIdGenerator,
): string => normalizeRequestContextId(requestId) ?? idGenerator.generate();

@Injectable()
export class RequestCorrelationIdFactory {
  private readonly idGenerator: IdGenerator;

  constructor(
    @Optional()
    @Inject(REQUEST_CORRELATION_ID_GENERATOR)
    idGenerator?: IdGenerator,
  ) {
    this.idGenerator = idGenerator ?? defaultCorrelationIdGenerator;
  }

  fromRequestId(requestId: string | undefined): string {
    return resolveRequestCorrelationId(requestId, this.idGenerator);
  }
}
