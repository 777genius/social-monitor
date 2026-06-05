import { Injectable, type NestMiddleware } from '@nestjs/common';
import {
  CAUSATION_ID_HEADER,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  buildRequestContext,
} from '@social-monitor/platform-request-context';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const context = buildRequestContext({
      requestId: request.header(REQUEST_ID_HEADER),
      correlationId: request.header(CORRELATION_ID_HEADER),
      causationId: request.header(CAUSATION_ID_HEADER),
    });

    response.setHeader(REQUEST_ID_HEADER, context.requestId);
    response.setHeader(CORRELATION_ID_HEADER, context.correlationId);
    if (context.causationId) {
      response.setHeader(CAUSATION_ID_HEADER, context.causationId);
    }
    next();
  }
}
