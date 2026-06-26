import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import {
  CAUSATION_ID_HEADER,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  buildRequestContext,
} from '@social-monitor/platform-request-context';
import { DomainError, redactSensitiveRecord, type DomainErrorCode } from '@social-monitor/shared-kernel';

type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: DomainErrorCode;
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly details: Readonly<Record<string, unknown>>;
};

type HeaderValue = number | string | readonly string[] | undefined;

type ProblemHttpRequest = {
  header(name: string): string | undefined;
};

type ProblemHttpResponse = {
  getHeader(name: string): HeaderValue;
  setHeader(name: string, value: string): void;
  status(statusCode: number): {
    json(body: ProblemDetails): void;
  };
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ProblemHttpRequest>();
    const response = http.getResponse<ProblemHttpResponse>();
    const status = statusForDomainError(exception.code);
    const requestContext = buildProblemRequestContext(request, response);

    response.setHeader(REQUEST_ID_HEADER, requestContext.requestId);
    response.setHeader(CORRELATION_ID_HEADER, requestContext.correlationId);
    if (requestContext.causationId) {
      response.setHeader(CAUSATION_ID_HEADER, requestContext.causationId);
    }

    response.status(status).json({
      type: `https://social-monitor.local/problems/${exception.code}`,
      title: titleForDomainError(exception.code),
      status,
      detail: exception.message,
      code: exception.code,
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      ...(requestContext.causationId ? { causationId: requestContext.causationId } : {}),
      details: redactProblemDetails(exception.details),
    });
  }
}

export const redactProblemDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => redactSensitiveRecord(details);

export const buildProblemRequestContext = (
  request: ProblemHttpRequest,
  response: Pick<ProblemHttpResponse, 'getHeader'>,
) => buildRequestContext({
  requestId: readHeaderValue(response.getHeader(REQUEST_ID_HEADER)) ?? request.header(REQUEST_ID_HEADER),
  correlationId: readHeaderValue(response.getHeader(CORRELATION_ID_HEADER)) ?? request.header(CORRELATION_ID_HEADER),
  causationId: readHeaderValue(response.getHeader(CAUSATION_ID_HEADER)) ?? request.header(CAUSATION_ID_HEADER),
});

const readHeaderValue = (value: HeaderValue): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return value?.find((entry) => typeof entry === 'string');
};

const statusForDomainError = (code: DomainErrorCode): number => {
  switch (code) {
    case 'validation.failed':
    case 'tenant.scope_missing':
      return HttpStatus.BAD_REQUEST;
    case 'authorization.denied':
      return HttpStatus.FORBIDDEN;
    case 'resource.not_found':
      return HttpStatus.NOT_FOUND;
    case 'operation.conflict':
      return HttpStatus.CONFLICT;
    case 'operation.quota_exceeded':
    case 'operation.backpressure':
    case 'operation.rate_limited':
      return HttpStatus.TOO_MANY_REQUESTS;
    case 'external.dependency_unavailable':
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
};

const titleForDomainError = (code: DomainErrorCode): string => {
  switch (code) {
    case 'validation.failed':
      return 'Validation failed';
    case 'tenant.scope_missing':
      return 'Tenant scope missing';
    case 'authorization.denied':
      return 'Authorization denied';
    case 'resource.not_found':
      return 'Resource not found';
    case 'operation.conflict':
      return 'Operation conflict';
    case 'operation.quota_exceeded':
      return 'Quota exceeded';
    case 'operation.backpressure':
      return 'Backpressure limit reached';
    case 'operation.rate_limited':
      return 'Rate limit exceeded';
    case 'external.dependency_unavailable':
      return 'External dependency unavailable';
  }
};
