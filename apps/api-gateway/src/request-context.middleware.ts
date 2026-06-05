import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header(REQUEST_ID_HEADER);
    const requestId = incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId
      : crypto.randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
