export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp?: string;
  path?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(body: ApiErrorBody, fallback?: { status?: number; message?: string }) {
    super(body.message ?? fallback?.message ?? "Request failed");
    this.name = "ApiError";
    this.status = body.statusCode ?? fallback?.status ?? 500;
    this.code = body.code ?? "UNKNOWN";
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

/**
 * 401 con mensaje "User account is INVITADO" — el usuario completó OAuth pero
 * aún no fue activado por un ADMIN. Distinto del 401 genérico (sesión inválida).
 */
export class InvitedError extends ApiError {
  constructor(body: ApiErrorBody) {
    super(body);
    this.name = "InvitedError";
  }
}

export function isInvitedError(e: unknown): e is InvitedError {
  return e instanceof InvitedError;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
