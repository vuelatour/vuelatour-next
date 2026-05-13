export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", body?: unknown) {
    super(401, message, body);
    this.name = "UnauthorizedError";
  }
}

export class InvitedError extends ApiError {
  constructor(message = "Tu cuenta está pendiente de activación por un administrador.", body?: unknown) {
    super(401, message, body);
    this.name = "InvitedError";
  }
}

export function isInvitedError(err: unknown): err is InvitedError {
  return err instanceof InvitedError;
}
