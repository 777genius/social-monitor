import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  CAUSATION_ID_HEADER,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  buildRequestContext,
} from '@social-monitor/platform-request-context';
import {
  DomainError,
  redactSensitiveRecord,
  redactSensitiveText,
  type DomainErrorCode,
} from '@social-monitor/shared-kernel';

type PublicProblemCode =
  | DomainErrorCode
  | 'authentication.required'
  | 'request.too_large'
  | 'internal.unexpected';

type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: PublicProblemCode;
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
  type?(contentType: string): ProblemHttpResponse;
  status(statusCode: number): {
    json(body: ProblemDetails): void;
  };
};

type PublicProblem = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: PublicProblemCode;
  readonly details: Readonly<Record<string, unknown>>;
};

@Catch()
export class DomainErrorFilter implements ExceptionFilter<unknown> {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ProblemHttpRequest>();
    const response = http.getResponse<ProblemHttpResponse>();
    const requestContext = buildProblemRequestContext(request, response);
    const problem = publicProblemForException(exception);

    response.setHeader(REQUEST_ID_HEADER, requestContext.requestId);
    response.setHeader(CORRELATION_ID_HEADER, requestContext.correlationId);
    if (requestContext.causationId) {
      response.setHeader(CAUSATION_ID_HEADER, requestContext.causationId);
    }

    response.type?.('application/problem+json');
    response.status(problem.status).json({
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      code: problem.code,
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
      ...(requestContext.causationId ? { causationId: requestContext.causationId } : {}),
      details: problem.details,
    });
  }
}

export const redactProblemDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => redactSensitiveRecord(details);

export const redactProblemDetail = (detail: string): string =>
  redactSensitiveText(detail);

export const buildProblemRequestContext = (
  request: ProblemHttpRequest,
  response: Pick<ProblemHttpResponse, 'getHeader'>,
) => buildRequestContext({
  requestId: readHeaderValue(response.getHeader(REQUEST_ID_HEADER)) ?? request.header(REQUEST_ID_HEADER),
  correlationId: readHeaderValue(response.getHeader(CORRELATION_ID_HEADER)) ?? request.header(CORRELATION_ID_HEADER),
  causationId: readHeaderValue(response.getHeader(CAUSATION_ID_HEADER)) ?? request.header(CAUSATION_ID_HEADER),
});

export const publicProblemForException = (exception: unknown): PublicProblem => {
  if (exception instanceof DomainError) {
    const status = statusForDomainError(exception.code);

    return {
      type: problemTypeForCode(exception.code),
      title: titleForProblemCode(exception.code),
      status,
      detail: redactProblemDetail(exception.message),
      code: exception.code,
      details: redactProblemDetails(exception.details),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForHttpStatus(status);

    return {
      type: problemTypeForCode(code),
      title: titleForProblemCode(code),
      status,
      detail: detailForHttpException(exception, code),
      code,
      details: detailsForHttpException(exception),
    };
  }

  return {
    type: problemTypeForCode('internal.unexpected'),
    title: titleForProblemCode('internal.unexpected'),
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: 'Unexpected server error',
    code: 'internal.unexpected',
    details: {},
  };
};

const readHeaderValue = (value: HeaderValue): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return value?.find((entry) => typeof entry === 'string');
};

const problemTypeForCode = (code: PublicProblemCode): string =>
  `https://social-monitor.local/problems/${code}`;

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

const codeForHttpStatus = (status: number): PublicProblemCode => {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'validation.failed';
    case HttpStatus.UNAUTHORIZED:
      return 'authentication.required';
    case HttpStatus.FORBIDDEN:
      return 'authorization.denied';
    case HttpStatus.NOT_FOUND:
      return 'resource.not_found';
    case HttpStatus.CONFLICT:
      return 'operation.conflict';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'request.too_large';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'operation.rate_limited';
    case HttpStatus.BAD_GATEWAY:
    case HttpStatus.SERVICE_UNAVAILABLE:
    case HttpStatus.GATEWAY_TIMEOUT:
      return 'external.dependency_unavailable';
    default:
      return status >= 500 ? 'internal.unexpected' : 'validation.failed';
  }
};

const titleForProblemCode = (code: PublicProblemCode): string => {
  switch (code) {
    case 'validation.failed':
      return 'Validation failed';
    case 'authentication.required':
      return 'Authentication required';
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
    case 'request.too_large':
      return 'Request too large';
    case 'internal.unexpected':
      return 'Internal server error';
  }
};

const detailForHttpException = (
  exception: HttpException,
  code: PublicProblemCode,
): string => {
  if (exception.getStatus() >= 500) {
    return code === 'external.dependency_unavailable'
      ? 'External dependency unavailable'
      : 'Unexpected server error';
  }

  return firstHttpExceptionMessage(exception) ?? titleForProblemCode(code);
};

const detailsForHttpException = (
  exception: HttpException,
): Readonly<Record<string, unknown>> => {
  if (exception.getStatus() >= 500) {
    return {};
  }

  const messages = httpExceptionMessages(exception);
  return redactProblemDetails(messages.length > 0 ? { messages } : {});
};

const firstHttpExceptionMessage = (exception: HttpException): string | undefined =>
  httpExceptionMessages(exception)[0];

const httpExceptionMessages = (exception: HttpException): readonly string[] => {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return [redactProblemDetail(response)];
  }

  if (!isRecord(response)) {
    return [];
  }

  const rawMessage = response.message;
  const messages = Array.isArray(rawMessage) ? rawMessage : [rawMessage];

  return messages
    .filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
    .slice(0, 20)
    .map((message) => redactProblemDetail(message));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
